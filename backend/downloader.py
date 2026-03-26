import asyncio
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any, Callable, Coroutine

TMP_DIR = Path(__file__).parent / "tmp"
TMP_DIR.mkdir(exist_ok=True)

# Sent with every yt-dlp request so CDNs and news sites don't block us
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

_BEST_QUALITY = {
    "format_id": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
    "label": "Best Quality",
    "ext": "mp4",
    "filesize": None,
    "height": None,
}

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
    args = ["yt-dlp", "--no-playlist", "--user-agent", USER_AGENT]

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
    low = stderr.lower()
    if "private video" in low or "this video is private" in low:
        raise ValueError("This video is private.")
    if "age" in low and "restricted" in low:
        raise ValueError("Age-restricted content — import your browser cookies and try again.")
    if "403" in stderr or "401" in stderr or "http forbidden" in low or "access denied" in low:
        raise ValueError(
            "Access denied (403/401) — this site blocks bots. "
            "Import your browser cookies via the Cookies button and try again."
        )
    if "not supported" in low or "unsupported url" in low:
        raise ValueError("URL not supported — no video found on this page.")
    raise ValueError(f"Could not fetch video info: {stderr[:300]}")


def _single_from_data(data: dict, platform: str) -> dict[str, Any]:
    """Build a type=single response dict from a yt-dlp JSON object."""
    return {
        "type": "single",
        "title": data.get("title", "Untitled"),
        "thumbnail": data.get("thumbnail"),
        "duration": data.get("duration"),
        "platform": platform,
        "uploader": data.get("uploader"),
        "formats": _parse_formats(data.get("formats", [])),
        "raw_id": data.get("id"),
    }


async def _run_ydl(args: list[str]) -> tuple[int, str, str]:
    """Run yt-dlp and return (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    return proc.returncode, out.decode(errors="replace"), err.decode(errors="replace")


async def fetch_metadata(
    url: str,
    allow_playlist: bool = False,
    cookies_path: str | None = None,
) -> dict[str, Any]:
    platform = detect_platform(url)

    base: list[str] = ["yt-dlp", "--user-agent", USER_AGENT]
    if cookies_path and Path(cookies_path).exists():
        base += ["--cookies", cookies_path]

    last_stderr = ""

    # ── Attempt 1: site-specific extractor, single video ──────────────────
    rc, out, err = await _run_ydl(base + ["--no-playlist", "--dump-json", url])
    last_stderr = err

    if rc == 0:
        lines = [l for l in out.splitlines() if l.strip()]
        if lines:
            data = json.loads(lines[0])
            if data.get("_type") not in ("playlist", "multi_video"):
                return _single_from_data(data, platform)

    # ── Attempt 1b: force generic extractor (news sites, custom players) ──
    # Skipped for sites that always block bots (Reuters, paywalled sites)
    if "401" not in err and "403" not in err and "http forbidden" not in err.lower():
        rc1b, out1b, err1b = await _run_ydl(
            base + ["--no-playlist", "--dump-json", "--force-generic-extractor", url]
        )
        if rc1b == 0:
            lines1b = [l for l in out1b.splitlines() if l.strip()]
            if lines1b:
                data1b = json.loads(lines1b[0])
                if data1b.get("_type") not in ("playlist", "multi_video"):
                    return _single_from_data(data1b, platform)
        last_stderr = err1b or err

    rc2, out2, err2 = await _run_ydl(base + ["--flat-playlist", "--dump-json", url])
    if err2:
        last_stderr = err2

    if rc2 == 0:
        lines2 = [l for l in out2.splitlines() if l.strip()]
        if lines2:
            first = json.loads(lines2[0])

            if first.get("_type") == "playlist":
                raw_entries = first.get("entries") or []
                entries = [_parse_flat_entry(e, platform) for e in raw_entries if e]
                page_title = first.get("title") or url
            elif len(lines2) > 1:
                entries = [_parse_flat_entry(json.loads(l), platform) for l in lines2]
                page_title = f"{platform.capitalize()} playlist"
            else:
                return _single_from_data(first, platform)

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
    _raise_ytdlp_error(last_stderr)
    raise ValueError("No video found on this page.")


def _parse_formats(raw_formats: list[dict]) -> list[dict]:
    """
    Return a clean, deduplicated list of user-facing format options.
    Always includes "Best Quality" as the first option so the DownloadButton
    renders even for sites that return HLS/DASH-only formats with null heights.
    """
    seen_heights: set[int] = set()
    result: list[dict] = []
    has_audio_only = False

    for fmt in reversed(raw_formats):
        vcodec = fmt.get("vcodec") or "none"   # treat None as "none"
        acodec = fmt.get("acodec") or "none"
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

    # Always prepend "Best Quality" — this ensures the DownloadButton renders
    # even when all formats are HLS adaptive streams with no explicit height/codec.
    return [_BEST_QUALITY, *result]


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
