import asyncio
from pathlib import Path

TMP_DIR = Path(__file__).parent / "tmp"
TMP_DIR.mkdir(exist_ok=True)

# In-memory toolkit task registry
_toolkit_tasks: dict[str, dict] = {}


def get_task(task_id: str) -> dict | None:
    return _toolkit_tasks.get(task_id)


async def run_operation(input_path: str, operation: str, options: dict, task_id: str) -> Path:
    _toolkit_tasks[task_id] = {"status": "processing", "output": None, "error": None}

    inp = Path(input_path)
    if not inp.exists():
        _toolkit_tasks[task_id] = {"status": "error", "error": "Input file not found"}
        raise FileNotFoundError("Input file not found")

    out_ext = "mp4"
    if operation == "audio_extract":
        out_ext = "mp3"
    elif operation == "export_gif":
        out_ext = "gif"

    out_path = TMP_DIR / f"{task_id}_{operation}.{out_ext}"

    if operation == "compress_social":
        cmd = ["ffmpeg", "-i", str(inp), "-vf", "scale=-2:720", "-c:v", "libx264", "-crf", "28", "-preset", "fast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(out_path), "-y"]

    elif operation == "vertical_crop":
        cmd = ["ffmpeg", "-i", str(inp), "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920", "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-c:a", "copy", str(out_path), "-y"]

    elif operation == "trim":
        start = float(options.get("start", 0))
        end = float(options.get("end", 60))
        cmd = ["ffmpeg", "-i", str(inp), "-ss", str(start), "-to", str(end), "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-c:a", "aac", str(out_path), "-y"]

    elif operation == "audio_extract":
        cmd = ["ffmpeg", "-i", str(inp), "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k", str(out_path), "-y"]

    elif operation == "add_watermark":
        text = options.get("text", "ShadowDL").replace("'", "\\'").replace(":", "\\:")
        cmd = ["ffmpeg", "-i", str(inp), "-vf", f"drawtext=text='{text}':fontcolor=white@0.8:fontsize=32:x=w-tw-20:y=h-th-20:shadowcolor=black:shadowx=2:shadowy=2", "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-c:a", "copy", str(out_path), "-y"]

    elif operation == "burn_subtitles":
        srt = options.get("srt_path", "")
        escaped = srt.replace("'", "\\'").replace(":", "\\:")
        cmd = ["ffmpeg", "-i", str(inp), "-vf", f"subtitles='{escaped}'", "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-c:a", "copy", str(out_path), "-y"]

    else:
        _toolkit_tasks[task_id] = {"status": "error", "error": f"Unknown operation: {operation}"}
        raise ValueError(f"Unknown operation: {operation}")

    try:
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        stdout, _ = await proc.communicate()
        if proc.returncode != 0:
            err = stdout.decode(errors="replace")[-300:]
            _toolkit_tasks[task_id] = {"status": "error", "error": err}
            raise RuntimeError(f"FFmpeg error: {err}")
        _toolkit_tasks[task_id] = {"status": "done", "output": str(out_path)}
        return out_path
    except Exception as e:
        _toolkit_tasks[task_id] = {"status": "error", "error": str(e)}
        raise
