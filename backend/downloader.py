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
    "youtube":     r"(youtube\.com|youtu\.be)",
    "tiktok":      r"tiktok\.com",
    "instagram":   r"instagram\.com",
    "facebook":    r"(facebook\.com|fb\.com|fb\.watch)",
    "reddit":      r"reddit\.com",
    "twitter":     r"(twitter\.com|x\.com)",
    "pornhub":     r"pornhub\.com",
    "xvideos":     r"xvideos\.com",
    "xnxx":        r"xnxx\.com",
    "redtube":     r"redtube\.com",
    "linkedin":    r"linkedin\.com",
    "bbc":         r"bbc\.(co\.uk|com)",
    "cnn":         r"cnn\.com",
    "aljazeera":   r"aljazeera\.com",
    "reuters":     r"reuters\.com",
    "twitch":      r"twitch\.tv",
    "vimeo":       r"vimeo\.com",
    "dailymotion": r"dailymotion\.com",
    "bilibili":    r"bilibili\.com",
    "rumble":      r"rumble\.com",
    "odysee":      r"odysee\.com",
    "streamable":  r"streamable\.com",
}


def detect_platform(url: str) -> str:
    for platform, pattern in PLATFORM_PATTERNS.items():
        if re.search(pattern, url, re.IGNORECASE):
            return platform
    return "unknown"


def _build_ydl_opts(
    platform: str,
    format_selector: str | None = None,
    cookies_path: str | None = None,
) -> list[str]:
    """Build yt-dlp CLI args for a given platform."""
    args = ["yt-dlp", "--no-playlist"]

    selector = format_selector or "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
    args += ["-f", selector]

    if cookies_path and Path(cookies_path).exists():
        args += ["--cookies", cookies_path]

    return args


def _parse_flat_entry(entry: dict, platform: str) -> dict:
    """Convert a yt-dlp flat-playlist entry to a MultiEntry dict."""
    url = entry.get("url") or entry.get("webpage_url") or ""
    thumbnails = entry.get("thumbnails") or []
    thumbnail = (
        entry.get("thumbnail")
        or (thumbnails[0].get("url") if thumbnails else None)
    )
    return {
        "id": entry.get("id") or url,
        "url": url,
        "title": entry.get("title") or "Untitled",
        "thumbnail": thumbnail,
        "duration": entry.get("duration"),
        "uploader": entry.get("uploader") or entry.get("channel"),
    }


def _bs4_scrape_videos(url: str) -> list[dict]:
    """Synchronous BeautifulSoup fallback — finds raw <video>/<source> tags."""
    try:
        import requests
        from bs4 import BeautifulSoup
        resp = requests.get(url, timeout=12, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        entries: list[dict] = []
        seen: set[str] = set()
        for tag in soup.find_all(["video", "source"]):
            src = tag.get("src") or tag.get("data-src") or ""
            if not src or not src.startswith("http") or src in seen:
                continue
            seen.add(src)
            entries.append({
                "id": src,
                "url": src,
                "title": tag.get("title") or f"Video {len(entries) + 1}",
                "thumbnail": None,
                "duration": None,
                "uploader": None,
            })
        return entries
    except Exception:
        return []


def _raise_ytdlp_error(stderr: str) -> None:
    if "Private video" in stderr or "This video is private" in stderr:
        raise ValueError("This video is private.")
    if "age" in stderr.lower() and "restricted" in stderr.lower():
        raise ValueError("Age-restricted content — try importing browser cookies.")
    if "not supported" in stderr.lower() or "unsupported url" in stderr.lower():
        raise ValueError("URL not supported — no video found on this page.")
    raise ValueError(f"Could not fetch video info: {stderr[:300]}")


async def fetch_metadata(
    url: str,
    allow_playlist: bool = False,
    cookies_path: str | None = None,
) -> dict[str, Any]:
    platform = detect_platform(url)

    base: list[str] = ["yt-dlp"]
    if cookies_path and Path(cookies_path).exists():
        base += ["--cookies", cookies_path]

    # ── Attempt 1: single video (existing path) ────────────────────────────
    proc = await asyncio.create_subprocess_exec(
        *base, "--no-playlist", "--dump-json", url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode == 0:
        raw = stdout.decode(errors="replace").strip()
        lines = [l for l in raw.splitlines() if l.strip()]
        if lines:
            data = json.loads(lines[0])
            if data.get("_type") not in ("playlist", "multi_video"):
                # ── Single video — return existing format ──────────────────
                formats = _parse_formats(data.get("formats", []))
                return {
                    "type": "single",
                    "title": data.get("title", "Untitled"),
                    "thumbnail": data.get("thumbnail"),
                    "duration": data.get("duration"),
                    "platform": platform,
                    "uploader": data.get("uploader"),
                    "formats": formats,
                    "raw_id": data.get("id"),
                }

    # ── Attempt 2: playlist / multi-video page ─────────────────────────────
    proc2 = await asyncio.create_subprocess_exec(
        *base, "--flat-playlist", "--dump-json", url,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout2, stderr2 = await proc2.communicate()

    if proc2.returncode == 0:
        raw2 = stdout2.decode(errors="replace").strip()
        lines2 = [l for l in raw2.splitlines() if l.strip()]
        if lines2:
            first = json.loads(lines2[0])

            if first.get("_type") == "playlist":
                # Playlist object with embedded entries
                raw_entries = first.get("entries") or []
                entries = [_parse_flat_entry(e, platform) for e in raw_entries if e]
                page_title = first.get("title") or first.get("webpage_url") or url
            elif len(lines2) > 1:
                # Multiple newline-delimited flat entries
                entries = [_parse_flat_entry(json.loads(l), platform) for l in lines2]
                page_title = f"{PLATFORM_PATTERNS.get(platform, platform).capitalize() if platform != 'unknown' else 'Page'} playlist"
            else:
                # Single entry came back — treat as single
                formats = _parse_formats(first.get("formats", []))
                return {
                    "type": "single",
                    "title": first.get("title", "Untitled"),
                    "thumbnail": first.get("thumbnail"),
                    "duration": first.get("duration"),
                    "platform": platform,
                    "uploader": first.get("uploader"),
                    "formats": formats,
                    "raw_id": first.get("id"),
                }

            if entries:
                return {
                    "type": "multi",
                    "page_title": page_title,
                    "platform": platform,
                    "count": len(entries),
                    "entries": entries,
                }

    # ── Attempt 3: BeautifulSoup HTML fallback ─────────────────────────────
    loop = asyncio.get_event_loop()
    bs4_entries = await loop.run_in_executor(None, _bs4_scrape_videos, url)
    if bs4_entries:
        return {
            "type": "multi",
            "page_title": url,
            "platform": platform,
            "count": len(bs4_entries),
            "entries": bs4_entries,
        }

    # ── All attempts failed ────────────────────────────────────────────────
    err = stderr2.decode(errors="replace") if proc2.returncode != 0 else stderr.decode(errors="replace")
    _raise_ytdlp_error(err)
    raise ValueError("No video found on this page.")  # unreachable but satisfies type checker


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
    proxy: str | None = None,
    cookies_path: str | None = None,
) -> Path:
    """Download video to tmp dir, streaming progress via callback."""
    platform = detect_platform(url)
    args = _build_ydl_opts(platform, format_id, cookies_path=cookies_path)

    if proxy:
        args += ["--proxy", proxy]

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


async def update_ytdlp() -> str:
    """Run yt-dlp -U on startup. Non-fatal — runs fire-and-forget."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "yt-dlp", "-U",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        lines = stdout.decode(errors="replace").strip().splitlines()
        return lines[-1] if lines else "yt-dlp is up to date."
    except Exception as e:
        return f"yt-dlp update skipped: {e}"


def clean_filename(title: str, platform: str, quality: str) -> str:
    # Strip characters illegal in filenames
    safe = re.sub(r'[\\/*?:"<>|]', "", title).strip()
    safe = re.sub(r"\s+", " ", safe)[:80]
    # Remove non-ASCII (emoji, etc.) so the name is safe for HTTP latin-1 headers
    ascii_safe = safe.encode("ascii", errors="ignore").decode("ascii").strip()
    if not ascii_safe:
        ascii_safe = platform.capitalize()
    return f"{ascii_safe} - {platform.capitalize()} - {quality}.mp4"
