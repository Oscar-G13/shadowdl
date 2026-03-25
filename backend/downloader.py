import asyncio
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Callable, Coroutine

TMP_DIR = Path(__file__).parent / "tmp"
TMP_DIR.mkdir(exist_ok=True)

# Platform detection patterns
PLATFORM_PATTERNS = {
    "youtube": [r"(youtube\.com|youtu\.be)"],
    "tiktok": [r"tiktok\.com"],
    "instagram": [r"instagram\.com"],
    "facebook": [r"(facebook\.com|fb\.com|fb\.watch)"],
    "reddit": [r"reddit\.com"],
    "twitter": [r"(twitter\.com|x\.com)"],
}


def detect_platform(url: str) -> str:
    for platform, patterns in PLATFORM_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return platform
    return "unknown"


def _build_ydl_opts(platform: str, format_selector: str | None = None) -> list[str]:
    """Build yt-dlp CLI args for a given platform."""
    args = ["yt-dlp", "--no-playlist"]

    # Use the provided selector (always includes audio) or the default best merge
    selector = format_selector or "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
    args += ["-f", selector]

    return args


async def fetch_metadata(url: str) -> dict[str, Any]:
    platform = detect_platform(url)
    # --dump-json doesn't need a format selector; use flat args
    args = ["yt-dlp", "--no-playlist", "--dump-json", url]

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = stderr.decode(errors="replace")
        if "Private video" in err or "This video is private" in err:
            raise ValueError("This video is private.")
        if "age" in err.lower() and "restricted" in err.lower():
            raise ValueError("Age-restricted content — cannot download.")
        if "not supported" in err.lower() or "unsupported url" in err.lower():
            raise ValueError("This URL is not supported.")
        raise ValueError(f"Could not fetch video info: {err[:200]}")

    data = json.loads(stdout.decode())

    formats = _parse_formats(data.get("formats", []))

    return {
        "title": data.get("title", "Untitled"),
        "thumbnail": data.get("thumbnail"),
        "duration": data.get("duration"),
        "platform": platform,
        "uploader": data.get("uploader"),
        "formats": formats,
        "raw_id": data.get("id"),
    }


def _parse_formats(raw_formats: list[dict]) -> list[dict]:
    """
    Return a clean, deduplicated list of user-facing format options.
    Each format_id is a yt-dlp selector string (not a raw ID) so that
    audio is always merged when downloading video streams.
    """
    seen_heights: set[int] = set()
    result = []

    has_audio_only = False

    for fmt in reversed(raw_formats):
        vcodec = fmt.get("vcodec", "none")
        acodec = fmt.get("acodec", "none")
        height = fmt.get("height")
        filesize = fmt.get("filesize") or fmt.get("filesize_approx")

        if vcodec == "none" and acodec != "none" and not has_audio_only:
            has_audio_only = True
            result.append({
                "format_id": "bestaudio[ext=m4a]/bestaudio",
                "label": "Audio Only",
                "ext": "m4a",
                "filesize": filesize,
                "height": None,
            })
        elif vcodec != "none" and height and height not in seen_heights:
            seen_heights.add(height)
            # Build a selector that forces audio merge — this is what fixes YouTube no-audio
            selector = (
                f"bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]"
                f"/bestvideo[height<={height}]+bestaudio"
                f"/best[height<={height}]"
            )
            result.append({
                "format_id": selector,
                "label": f"{height}p",
                "ext": "mp4",
                "filesize": filesize,
                "height": height,
            })

    # Sort: highest resolution first, Audio Only last
    result.sort(key=lambda f: f.get("height") or -1, reverse=True)

    # Prepend "Best Quality" as the default
    if result:
        result.insert(0, {
            "format_id": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
            "label": "Best Quality",
            "ext": "mp4",
            "filesize": None,
            "height": None,
        })

    return result


async def download_video(
    url: str,
    format_id: str,  # actually a selector string, not a raw ID
    task_id: str,
    on_progress: Callable[[dict], Coroutine],
) -> Path:
    """Download video to tmp dir, streaming progress via callback."""
    platform = detect_platform(url)
    args = _build_ydl_opts(platform, format_id)

    output_template = str(TMP_DIR / f"{task_id}.%(ext)s")
    args += [
        "--newline",          # one progress line per update — easy to parse
        "--progress",
        "--merge-output-format", "mp4",
        "-o", output_template,
        url,
    ]

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    progress_re = re.compile(
        r"\[download\]\s+([\d.]+)%\s+of\s+[\S]+\s+at\s+([\S]+)\s+ETA\s+([\S]+)"
    )

    async for line in proc.stdout:
        text = line.decode(errors="replace").strip()
        match = progress_re.search(text)
        if match:
            await on_progress({
                "type": "progress",
                "percent": float(match.group(1)),
                "speed": match.group(2),
                "eta": match.group(3),
            })

    await proc.wait()

    if proc.returncode != 0:
        raise RuntimeError("Download failed — yt-dlp exited with an error.")

    # Find the output file (extension may vary before merge)
    matches = list(TMP_DIR.glob(f"{task_id}.*"))
    if not matches:
        raise RuntimeError("Download finished but output file not found.")

    return matches[0]


def clean_filename(title: str, platform: str, quality: str) -> str:
    # Strip characters illegal in filenames
    safe = re.sub(r'[\\/*?:"<>|]', "", title).strip()
    safe = re.sub(r"\s+", " ", safe)[:80]
    # Remove non-ASCII (emoji, etc.) so the name is safe for HTTP latin-1 headers
    ascii_safe = safe.encode("ascii", errors="ignore").decode("ascii").strip()
    if not ascii_safe:
        ascii_safe = platform.capitalize()
    return f"{ascii_safe} - {platform.capitalize()} - {quality}.mp4"
