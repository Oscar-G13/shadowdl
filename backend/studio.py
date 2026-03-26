"""
Shadow Studio backend — Whisper transcription, subtitle processing,
FFmpeg video editing, magic presets, and AI suggestions.
"""

import asyncio
import json
import os
import re as _re
from pathlib import Path
from openai import AsyncOpenAI

TMP_DIR = Path(__file__).parent / "tmp"
TMP_DIR.mkdir(exist_ok=True)

_studio_tasks: dict[str, dict] = {}
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def get_task(task_id: str) -> dict | None:
    return _studio_tasks.get(task_id)


# ── Duration ───────────────────────────────────────────────────────────────────

async def get_video_duration(file_path: str) -> float:
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", file_path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    try:
        data = json.loads(stdout)
        for stream in data.get("streams", []):
            if "duration" in stream:
                return float(stream["duration"])
    except Exception:
        pass
    return 0.0


# ── FFmpeg with progress ───────────────────────────────────────────────────────

async def _run_ffmpeg_with_progress(
    cmd: list[str],
    task_id: str,
    duration: float,
    out_path: Path,
) -> tuple[int, str]:
    """Run FFmpeg, parse stderr for time= progress, update task dict."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    output_chunks: list[str] = []

    while True:
        chunk = await proc.stdout.read(512)
        if not chunk:
            break
        text = chunk.decode(errors="replace")
        output_chunks.append(text)

        m = _re.search(r"time=(\d+):(\d+):(\d+\.?\d*)", text)
        if m and duration > 0:
            h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
            current = h * 3600 + mn * 60 + s
            pct = min(99, int(current / duration * 100))
            _studio_tasks[task_id]["percent"] = pct

    await proc.wait()
    tail = "".join(output_chunks)[-600:]
    return proc.returncode, tail


# ── CSS filter → FFmpeg filter map ────────────────────────────────────────────

CSS_FILTER_FFMPEG: dict[str, str | None] = {
    "none": None,
    "greyscale": "hue=s=0",
    "noir": "hue=s=0,eq=contrast=1.5:brightness=-0.07",
    "sepia": "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
    "cinematic": "eq=contrast=1.2:saturation=0.75:brightness=-0.03",
    "vivid": "eq=saturation=1.8:contrast=1.1",
    "neon": "hue=H=90:s=2,eq=brightness=0.05",
    "warm": "colorbalance=rs=0.1:gs=0.05:bs=-0.15",
    "cool": "colorbalance=rs=-0.1:gs=-0.05:bs=0.2",
    "fade": "eq=contrast=0.85:saturation=0.7:brightness=0.05",
    "golden": "colorbalance=rs=0.15:gs=0.05:bs=-0.2,eq=saturation=1.5",
    "night": "eq=brightness=-0.1:contrast=1.3:saturation=0.5",
    "summer": "eq=brightness=0.05:saturation=1.4,hue=H=10",
    "drama": "eq=contrast=1.5:brightness=-0.05:saturation=1.2",
    "soft": "eq=contrast=0.9:saturation=0.85:brightness=0.02",
    "glitch": "hue=H=180:s=3,eq=contrast=1.5",
    "vhs": "eq=contrast=1.1:saturation=1.3:brightness=-0.02,hue=H=-10",
    "teal_orange": "colorbalance=rs=0.1:gs=-0.05:bs=-0.1,hue=H=-20,eq=saturation=1.5",
    "matte": "eq=contrast=0.8:brightness=0.07:saturation=0.6",
    "pop": "eq=saturation=3:contrast=1.3",
    # Legacy names kept for backward compat
    "vintage": "curves=vintage",
    "bw": "hue=s=0",
    "cinema": "eq=contrast=1.1:saturation=0.85,vignette=PI/4",
}


# ── AI Magic Suggest ───────────────────────────────────────────────────────────

async def ai_magic_suggest(metadata: dict, segments: list[dict], task_id: str) -> dict:
    _studio_tasks[task_id] = {"status": "analyzing"}

    title = metadata.get("title", "Untitled")
    duration = metadata.get("duration", 0)
    platform = metadata.get("platform", "unknown")
    transcript = " ".join(s.get("text", "") for s in segments[:60])[:3000]

    prompt = f"""You are a viral content strategist. Analyze this video and suggest specific edits.

Video: "{title}" ({duration}s) from {platform}
Transcript: {transcript or "(no transcript available)"}

Return ONLY valid JSON with this structure:
{{
  "viral_moments": [
    {{"start": <seconds>, "end": <seconds>, "reason": "<why it is viral>"}},
    {{"start": <seconds>, "end": <seconds>, "reason": "<why it is viral>"}}
  ],
  "recommended_trim": {{"start": <seconds>, "end": <seconds>, "reason": "<why>"}},
  "recommended_platform": "<tiktok|youtube_short|instagram_reels|youtube>",
  "caption_style": "<tiktok|bold|minimal|default>",
  "caption_suggestion": "<opening caption text under 10 words>",
  "hook": "<one sentence hook for description>",
  "music_energy": "<high|medium|low>"
}}

Be specific with timestamps. If no transcript, base analysis on title and duration."""

    try:
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        result = json.loads(response.choices[0].message.content)
    except Exception as e:
        result = {"error": str(e)}

    _studio_tasks[task_id] = {"status": "done", "suggestions": result}
    return result


# ── Transcription ──────────────────────────────────────────────────────────────

async def transcribe_video(file_path: str, task_id: str) -> list[dict]:
    _studio_tasks[task_id] = {"status": "extracting_audio", "percent": 0}

    audio_path = TMP_DIR / f"{task_id}_studio_audio.mp3"

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

    _studio_tasks[task_id] = {"status": "transcribing", "percent": 30}

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
    raw = getattr(transcript, "segments", [])
    for i, seg in enumerate(raw):
        segments.append({
            "id": i,
            "start": round(float(seg.start), 3),
            "end": round(float(seg.end), 3),
            "text": seg.text.strip(),
        })

    _studio_tasks[task_id] = {"status": "done", "segments": segments, "percent": 100}
    return segments


# ── SRT helpers ────────────────────────────────────────────────────────────────

def segments_to_srt(segments: list[dict]) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        lines.append(f"{i}\n{_ts_srt(seg['start'])} --> {_ts_srt(seg['end'])}\n{seg['text']}\n")
    return "\n".join(lines)


def _ts_srt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds % 1) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


SUBTITLE_STYLES = {
    "default": {"force_style": "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1.5,Shadow=0,MarginV=20"},
    "tiktok":  {"force_style": "FontName=Arial,FontSize=28,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=3,Shadow=0,MarginV=40,Alignment=2"},
    "bold":    {"force_style": "FontName=Impact,FontSize=34,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=4,Shadow=1,MarginV=30"},
    "minimal": {"force_style": "FontName=Arial,FontSize=16,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=15"},
}


# ── Subtitle burn ──────────────────────────────────────────────────────────────

async def burn_subtitles(file_path: str, segments: list[dict], style: str, task_id: str) -> Path:
    _studio_tasks[task_id] = {"status": "processing", "percent": 0}

    duration = await get_video_duration(file_path)
    srt_content = segments_to_srt(segments)
    srt_path = TMP_DIR / f"{task_id}_burn.srt"
    srt_path.write_text(srt_content, encoding="utf-8")

    out_path = TMP_DIR / f"{task_id}_subtitled.mp4"
    force_style = SUBTITLE_STYLES.get(style, SUBTITLE_STYLES["default"])["force_style"]
    escaped = str(srt_path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

    cmd = [
        "ffmpeg", "-i", file_path,
        "-vf", f"subtitles='{escaped}':force_style='{force_style}'",
        "-c:v", "libx264", "-crf", "22", "-preset", "fast",
        "-c:a", "copy",
        str(out_path), "-y",
    ]

    rc, err = await _run_ffmpeg_with_progress(cmd, task_id, duration, out_path)
    srt_path.unlink(missing_ok=True)

    if rc != 0 or not out_path.exists():
        _studio_tasks[task_id] = {"status": "error", "error": err[-400:]}
        raise RuntimeError(f"Subtitle burn failed: {err[-200:]}")

    _studio_tasks[task_id] = {"status": "done", "output": str(out_path), "percent": 100}
    return out_path


# ── Video editor export ────────────────────────────────────────────────────────

async def export_edit(file_path: str, edits: dict, task_id: str) -> Path:
    _studio_tasks[task_id] = {"status": "processing", "percent": 0}
    duration = await get_video_duration(file_path)

    v_filters: list[str] = []
    a_filters: list[str] = []

    # Speed
    speed = float(edits.get("speed", 1.0))
    if speed != 1.0:
        v_filters.append(f"setpts={1/speed:.4f}*PTS")
        if 0.5 <= speed <= 2.0:
            a_filters.append(f"atempo={speed:.2f}")
        elif speed < 0.5:
            a_filters += [f"atempo={speed/0.5:.2f}", "atempo=0.5"]
        else:
            a_filters += ["atempo=2.0", f"atempo={speed/2.0:.2f}"]

    # Crop ratio
    crop_ratio = edits.get("crop")
    if crop_ratio == "9:16":
        v_filters.append("crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920")
    elif crop_ratio == "1:1":
        v_filters.append("crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2")
    elif crop_ratio == "16:9":
        v_filters.append("crop=iw:iw*9/16:(ih-iw*9/16)/2:0") if False else None  # skip, usually already 16:9

    # CSS filter → FFmpeg
    filter_id = edits.get("filter") or edits.get("color_filter")
    if filter_id and filter_id in CSS_FILTER_FFMPEG:
        ffmpeg_filter = CSS_FILTER_FFMPEG[filter_id]
        if ffmpeg_filter:
            v_filters.append(ffmpeg_filter)

    # EQ adjustments (frontend sends CSS scale: brightness=1.0 normal, contrast=1.0 normal)
    # Convert: FFmpeg brightness = CSS brightness - 1.0
    brightness = float(edits.get("brightness", 0))  # accept either scale
    contrast   = float(edits.get("contrast", 1.0))
    saturation = float(edits.get("saturation", 1.0))

    # If value looks like CSS scale (brightness ~1.0 = normal), convert
    if abs(brightness) <= 2.0 and brightness != 0:
        brightness = brightness - 1.0  # CSS 1.0 → FFmpeg 0.0

    if brightness != 0 or contrast != 1.0 or saturation != 1.0:
        v_filters.append(f"eq=brightness={brightness:.3f}:contrast={contrast:.3f}:saturation={saturation:.3f}")

    # Volume
    volume = float(edits.get("volume", 1.0))
    if volume != 1.0:
        a_filters.append(f"volume={volume:.2f}")

    # Audio fades
    trim_start = float(edits.get("trim_start", 0))
    trim_end   = edits.get("trim_end")
    fade_in    = float(edits.get("audio_fade_in", 0))
    fade_out   = float(edits.get("audio_fade_out", 0))
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
        t_s = float(ov.get("start", 0))
        t_e = float(ov.get("end", 5))
        v_filters.append(
            f"drawtext=text='{text}':x={x}:y={y}:fontsize={fontsize}:fontcolor={color}"
            f":shadowcolor=black:shadowx=2:shadowy=2"
            f":enable='between(t\\,{t_s:.2f}\\,{t_e:.2f})'"
        )

    # Build command
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

    # Adjust duration for progress tracking
    clip_duration = (float(trim_end) - trim_start) if trim_end else duration - trim_start
    rc, err = await _run_ffmpeg_with_progress(cmd, task_id, clip_duration / speed, out_path)

    if rc != 0 or not out_path.exists():
        _studio_tasks[task_id] = {"status": "error", "error": err[-400:]}
        raise RuntimeError(f"Export failed: {err[-200:]}")

    _studio_tasks[task_id] = {"status": "done", "output": str(out_path), "percent": 100}
    return out_path


# ── Magic presets ──────────────────────────────────────────────────────────────

async def magic_viral_tiktok(file_path: str, task_id: str) -> Path:
    _studio_tasks[task_id] = {"status": "processing", "step": "editing", "percent": 0}
    duration = await get_video_duration(file_path)

    edit_id = f"{task_id}_edit"
    out_edit = TMP_DIR / f"{edit_id}_edited.mp4"
    cmd = [
        "ffmpeg", "-i", file_path, "-to", "60",
        "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-c:a", "aac",
        str(out_edit), "-y",
    ]
    rc, _ = await _run_ffmpeg_with_progress(cmd, task_id, min(duration, 60), out_edit)
    if not out_edit.exists():
        _studio_tasks[task_id] = {"status": "error", "error": "Crop/trim failed"}
        raise RuntimeError("Crop/trim failed")

    _studio_tasks[task_id]["step"] = "transcribing"
    _studio_tasks[task_id]["percent"] = 40
    try:
        segs = await transcribe_video(str(out_edit), f"{task_id}_tr")
        _studio_tasks[task_id]["step"] = "burning_subtitles"
        _studio_tasks[task_id]["percent"] = 70
        result = await burn_subtitles(str(out_edit), segs, "tiktok", f"{task_id}_burn")
        out_edit.unlink(missing_ok=True)
        _studio_tasks[task_id] = {"status": "done", "output": str(result), "percent": 100}
        return result
    except Exception:
        _studio_tasks[task_id] = {"status": "done", "output": str(out_edit), "percent": 100}
        return out_edit


async def magic_youtube_short(file_path: str, task_id: str) -> Path:
    _studio_tasks[task_id] = {"status": "processing", "step": "editing", "percent": 0}
    duration = await get_video_duration(file_path)

    out_edit = TMP_DIR / f"{task_id}_short.mp4"
    cmd = [
        "ffmpeg", "-i", file_path, "-to", "60",
        "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-c:a", "aac",
        str(out_edit), "-y",
    ]
    await _run_ffmpeg_with_progress(cmd, task_id, min(duration, 60), out_edit)
    if not out_edit.exists():
        _studio_tasks[task_id] = {"status": "error", "error": "Processing failed"}
        raise RuntimeError("Processing failed")

    _studio_tasks[task_id]["step"] = "transcribing"
    _studio_tasks[task_id]["percent"] = 50
    try:
        segs = await transcribe_video(str(out_edit), f"{task_id}_sub")
        result = await burn_subtitles(str(out_edit), segs, "default", f"{task_id}_burn")
        out_edit.unlink(missing_ok=True)
        _studio_tasks[task_id] = {"status": "done", "output": str(result), "percent": 100}
        return result
    except Exception:
        _studio_tasks[task_id] = {"status": "done", "output": str(out_edit), "percent": 100}
        return out_edit


async def magic_podcast_clean(file_path: str, task_id: str) -> Path:
    _studio_tasks[task_id] = {"status": "processing", "step": "extracting_audio", "percent": 0}
    duration = await get_video_duration(file_path)

    out_path = TMP_DIR / f"{task_id}_podcast.mp3"
    cmd = ["ffmpeg", "-i", file_path, "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", str(out_path), "-y"]
    await _run_ffmpeg_with_progress(cmd, task_id, duration, out_path)

    if not out_path.exists():
        _studio_tasks[task_id] = {"status": "error", "error": "Audio extraction failed"}
        raise RuntimeError("Audio extraction failed")

    _studio_tasks[task_id]["step"] = "transcribing"
    _studio_tasks[task_id]["percent"] = 60
    try:
        segs = await transcribe_video(file_path, f"{task_id}_sub")
        srt_path = TMP_DIR / f"{task_id}_podcast.srt"
        srt_path.write_text(segments_to_srt(segs), encoding="utf-8")
        _studio_tasks[task_id] = {
            "status": "done", "output": str(out_path),
            "srt_output": str(srt_path), "ext": "mp3", "percent": 100,
        }
    except Exception:
        _studio_tasks[task_id] = {"status": "done", "output": str(out_path), "ext": "mp3", "percent": 100}

    return out_path
