"""
Shadow Studio backend — Whisper transcription, subtitle processing,
FFmpeg video editing, and magic preset operations.
"""

import asyncio
import os
from pathlib import Path
from openai import AsyncOpenAI

TMP_DIR = Path(__file__).parent / "tmp"
TMP_DIR.mkdir(exist_ok=True)

# Studio task registry
_studio_tasks: dict[str, dict] = {}

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def get_task(task_id: str) -> dict | None:
    return _studio_tasks.get(task_id)


# ── Transcription ──────────────────────────────────────────────────────────────

async def transcribe_video(file_path: str, task_id: str) -> list[dict]:
    """
    Extract audio from video and transcribe via OpenAI Whisper.
    Returns list of {id, start, end, text} dicts.
    """
    _studio_tasks[task_id] = {"status": "extracting_audio"}

    audio_path = TMP_DIR / f"{task_id}_studio_audio.mp3"

    # Extract audio — 16kHz mono at low bitrate to stay under Whisper's 25MB limit
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-i", file_path,
        "-vn", "-ar", "16000", "-ac", "1", "-b:a", "64k",
        str(audio_path), "-y",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    await proc.communicate()

    if not audio_path.exists():
        _studio_tasks[task_id] = {"status": "error", "error": "Audio extraction failed"}
        raise RuntimeError("Audio extraction failed")

    _studio_tasks[task_id] = {"status": "transcribing"}

    try:
        with open(audio_path, "rb") as f:
            transcript = await client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
    finally:
        audio_path.unlink(missing_ok=True)

    segments = []
    raw_segments = getattr(transcript, "segments", [])
    for i, seg in enumerate(raw_segments):
        segments.append({
            "id": i,
            "start": round(float(seg.start), 3),
            "end": round(float(seg.end), 3),
            "text": seg.text.strip(),
        })

    _studio_tasks[task_id] = {"status": "done", "segments": segments}
    return segments


# ── SRT / ASS generation ───────────────────────────────────────────────────────

def segments_to_srt(segments: list[dict]) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        start = _ts_srt(seg["start"])
        end = _ts_srt(seg["end"])
        lines.append(f"{i}\n{start} --> {end}\n{seg['text']}\n")
    return "\n".join(lines)


def _ts_srt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _ts_ass(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


SUBTITLE_STYLES = {
    "default": {
        "force_style": "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1.5,Shadow=0,MarginV=20",
    },
    "tiktok": {
        "force_style": "FontName=Arial,FontSize=28,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=0,MarginV=40,Alignment=2",
    },
    "bold": {
        "force_style": "FontName=Impact,FontSize=34,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=4,Shadow=1,MarginV=30",
    },
    "minimal": {
        "force_style": "FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=15",
    },
}


# ── Subtitle burn ──────────────────────────────────────────────────────────────

async def burn_subtitles(
    file_path: str,
    segments: list[dict],
    style: str,
    task_id: str,
) -> Path:
    _studio_tasks[task_id] = {"status": "processing"}

    srt_content = segments_to_srt(segments)
    srt_path = TMP_DIR / f"{task_id}_burn.srt"
    srt_path.write_text(srt_content, encoding="utf-8")

    out_path = TMP_DIR / f"{task_id}_subtitled.mp4"
    force_style = SUBTITLE_STYLES.get(style, SUBTITLE_STYLES["default"])["force_style"]

    # Escape path for ffmpeg filter
    escaped = str(srt_path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

    cmd = [
        "ffmpeg", "-i", file_path,
        "-vf", f"subtitles='{escaped}':force_style='{force_style}'",
        "-c:v", "libx264", "-crf", "22", "-preset", "fast",
        "-c:a", "copy",
        str(out_path), "-y",
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    srt_path.unlink(missing_ok=True)

    if proc.returncode != 0 or not out_path.exists():
        err = stdout.decode(errors="replace")[-400:]
        _studio_tasks[task_id] = {"status": "error", "error": err}
        raise RuntimeError(f"Subtitle burn failed: {err}")

    _studio_tasks[task_id] = {"status": "done", "output": str(out_path)}
    return out_path


# ── Video editor export ────────────────────────────────────────────────────────

async def export_edit(file_path: str, edits: dict, task_id: str) -> Path:
    _studio_tasks[task_id] = {"status": "processing"}

    v_filters = []
    a_filters = []

    # Speed
    speed = float(edits.get("speed", 1.0))
    if speed != 1.0:
        v_filters.append(f"setpts={1/speed:.4f}*PTS")
        # atempo only supports 0.5–2.0, chain for extremes
        if 0.5 <= speed <= 2.0:
            a_filters.append(f"atempo={speed:.2f}")
        elif speed < 0.5:
            a_filters += [f"atempo={speed/0.5:.2f}", "atempo=0.5"]
        else:  # > 2.0
            a_filters += ["atempo=2.0", f"atempo={speed/2.0:.2f}"]

    # Crop
    crop = edits.get("crop")
    if crop:
        v_filters.append(f"crop={int(crop['w'])}:{int(crop['h'])}:{int(crop['x'])}:{int(crop['y'])}")

    # Rotate / flip
    rotate = int(edits.get("rotate", 0))
    if rotate == 90:
        v_filters.append("transpose=1")
    elif rotate == 180:
        v_filters.append("transpose=2,transpose=2")
    elif rotate == 270:
        v_filters.append("transpose=2")

    if edits.get("flip_h"):
        v_filters.append("hflip")
    if edits.get("flip_v"):
        v_filters.append("vflip")

    # Color filter preset
    color_filter = edits.get("color_filter")
    color_fx = {
        "vintage": "curves=vintage",
        "bw": "hue=s=0",
        "vivid": "eq=saturation=1.5:contrast=1.1",
        "cool": "colorbalance=rs=-0.1:gs=-0.05:bs=0.15",
        "warm": "colorbalance=rs=0.1:gs=0.05:bs=-0.1",
        "fade": "eq=brightness=0.05:contrast=0.9:saturation=0.75",
        "cinema": "eq=contrast=1.1:saturation=0.85,vignette=PI/4",
    }
    if color_filter and color_filter in color_fx:
        v_filters.append(color_fx[color_filter])

    # EQ adjustments
    brightness = float(edits.get("brightness", 0))
    contrast = float(edits.get("contrast", 1.0))
    saturation = float(edits.get("saturation", 1.0))
    if brightness != 0 or contrast != 1.0 or saturation != 1.0:
        v_filters.append(f"eq=brightness={brightness:.2f}:contrast={contrast:.2f}:saturation={saturation:.2f}")

    # Volume / audio fades
    volume = float(edits.get("volume", 1.0))
    if volume != 1.0:
        a_filters.append(f"volume={volume:.2f}")

    fade_in = float(edits.get("audio_fade_in", 0))
    fade_out = float(edits.get("audio_fade_out", 0))
    trim_end = edits.get("trim_end")
    trim_start = float(edits.get("trim_start", 0))

    if fade_in > 0:
        a_filters.append(f"afade=t=in:st=0:d={fade_in:.2f}")
    if fade_out > 0 and trim_end:
        clip_len = float(trim_end) - trim_start
        a_filters.append(f"afade=t=out:st={max(0, clip_len - fade_out):.2f}:d={fade_out:.2f}")

    # Text overlays
    for ov in edits.get("text_overlays", []):
        text = str(ov.get("text", "")).replace("'", "\\'").replace(":", "\\:")
        x = ov.get("x", "(w-text_w)/2")
        y = ov.get("y", "h-th-30")
        fontsize = int(ov.get("fontsize", 28))
        color = str(ov.get("color", "white"))
        t_start = float(ov.get("start", 0))
        t_end = float(ov.get("end", 5))
        v_filters.append(
            f"drawtext=text='{text}':x={x}:y={y}:fontsize={fontsize}:fontcolor={color}"
            f":shadowcolor=black:shadowx=2:shadowy=2"
            f":enable='between(t\\,{t_start:.2f}\\,{t_end:.2f})'"
        )

    # Build ffmpeg command
    out_path = TMP_DIR / f"{task_id}_edited.mp4"
    cmd = ["ffmpeg"]

    if trim_start > 0:
        cmd += ["-ss", str(trim_start)]
    cmd += ["-i", file_path]
    if trim_end:
        cmd += ["-to", str(float(trim_end) - trim_start)]

    if v_filters:
        cmd += ["-vf", ",".join(v_filters)]
    if a_filters:
        cmd += ["-af", ",".join(a_filters)]

    cmd += ["-c:v", "libx264", "-crf", "22", "-preset", "fast"]
    cmd += ["-c:a", "aac" if a_filters else "copy"]
    cmd += [str(out_path), "-y"]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()

    if proc.returncode != 0 or not out_path.exists():
        err = stdout.decode(errors="replace")[-400:]
        _studio_tasks[task_id] = {"status": "error", "error": err}
        raise RuntimeError(f"Export failed: {err}")

    _studio_tasks[task_id] = {"status": "done", "output": str(out_path)}
    return out_path


# ── Magic presets ──────────────────────────────────────────────────────────────

async def magic_viral_tiktok(file_path: str, task_id: str) -> Path:
    """Vertical crop + trim to 60s + auto-transcribe + bold subtitles."""
    _studio_tasks[task_id] = {"status": "processing", "step": "editing"}

    # Step 1: crop to vertical + trim to 60s
    edit_id = f"{task_id}_edit"
    out_edit = TMP_DIR / f"{edit_id}_edited.mp4"

    cmd = [
        "ffmpeg", "-i", file_path,
        "-to", "60",
        "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-c:a", "aac",
        str(out_edit), "-y",
    ]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    await proc.communicate()

    if not out_edit.exists():
        _studio_tasks[task_id] = {"status": "error", "error": "Crop/trim failed"}
        raise RuntimeError("Crop/trim failed")

    # Step 2: auto-transcribe
    _studio_tasks[task_id] = {"status": "processing", "step": "transcribing"}
    sub_task_id = f"{task_id}_transcribe"
    try:
        segments = await transcribe_video(str(out_edit), sub_task_id)
    except Exception as e:
        # If transcription fails, just return the edited video
        _studio_tasks[task_id] = {"status": "done", "output": str(out_edit)}
        return out_edit

    # Step 3: burn tiktok-style subtitles
    _studio_tasks[task_id] = {"status": "processing", "step": "burning_subtitles"}
    result = await burn_subtitles(str(out_edit), segments, "tiktok", f"{task_id}_burn")
    out_edit.unlink(missing_ok=True)
    _studio_tasks[task_id] = {"status": "done", "output": str(result)}
    return result


async def magic_youtube_short(file_path: str, task_id: str) -> Path:
    """Vertical crop + trim to 60s + default captions."""
    _studio_tasks[task_id] = {"status": "processing", "step": "editing"}

    out_edit = TMP_DIR / f"{task_id}_short.mp4"
    cmd = [
        "ffmpeg", "-i", file_path,
        "-to", "60",
        "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-c:a", "aac",
        str(out_edit), "-y",
    ]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    await proc.communicate()

    if not out_edit.exists():
        _studio_tasks[task_id] = {"status": "error", "error": "Processing failed"}
        raise RuntimeError("Processing failed")

    _studio_tasks[task_id] = {"status": "processing", "step": "transcribing"}
    sub_task_id = f"{task_id}_sub"
    try:
        segments = await transcribe_video(str(out_edit), sub_task_id)
        result = await burn_subtitles(str(out_edit), segments, "default", f"{task_id}_burn")
        out_edit.unlink(missing_ok=True)
        _studio_tasks[task_id] = {"status": "done", "output": str(result)}
        return result
    except Exception:
        _studio_tasks[task_id] = {"status": "done", "output": str(out_edit)}
        return out_edit


async def magic_podcast_clean(file_path: str, task_id: str) -> Path:
    """Extract audio, return MP3 with transcription as a bonus SRT."""
    _studio_tasks[task_id] = {"status": "processing", "step": "extracting_audio"}

    out_path = TMP_DIR / f"{task_id}_podcast.mp3"
    cmd = ["ffmpeg", "-i", file_path, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", str(out_path), "-y"]
    proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    await proc.communicate()

    if not out_path.exists():
        _studio_tasks[task_id] = {"status": "error", "error": "Audio extraction failed"}
        raise RuntimeError("Audio extraction failed")

    # Also transcribe
    _studio_tasks[task_id] = {"status": "processing", "step": "transcribing"}
    sub_task_id = f"{task_id}_sub"
    try:
        segments = await transcribe_video(file_path, sub_task_id)
        srt_content = segments_to_srt(segments)
        srt_path = TMP_DIR / f"{task_id}_podcast.srt"
        srt_path.write_text(srt_content, encoding="utf-8")
        _studio_tasks[task_id] = {
            "status": "done",
            "output": str(out_path),
            "srt_output": str(srt_path),
            "ext": "mp3",
        }
    except Exception:
        _studio_tasks[task_id] = {"status": "done", "output": str(out_path), "ext": "mp3"}

    return out_path
