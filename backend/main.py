import asyncio
import uuid
import secrets
import os
from urllib.parse import urlencode
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field, field_validator
from security import LocalAccessOnly, validate_video_url

import database
import downloader
import drive

COOKIES_PATH = str(Path(__file__).parent / "tmp" / "cookies.txt")

app = FastAPI(title="ShadowDL API")
app.add_middleware(LocalAccessOnly)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_tasks: dict[str, dict] = {}


@app.on_event("startup")
async def startup():
    Path(__file__).parent.joinpath("tmp").mkdir(exist_ok=True)
    await database.init_db()
    # Dependencies are updated through the reviewed requirements lockfile.


# ── Metadata ───────────────────────────────────────────────────────────────────

class MetadataRequest(BaseModel):
    url: str = Field(max_length=4096)

    _validate_url = field_validator("url")(validate_video_url)


def _cookies() -> str | None:
    return COOKIES_PATH if Path(COOKIES_PATH).exists() else None


@app.post("/api/metadata")
async def get_metadata(req: MetadataRequest):
    try:
        meta = await downloader.fetch_metadata(req.url, cookies_path=_cookies())
        return meta
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Metadata lookup failed")


# ── Download ───────────────────────────────────────────────────────────────────

class DownloadRequest(MetadataRequest):
    format_id: str = Field(max_length=512)
    quality_label: str = Field(max_length=100)
    title: str = Field(max_length=500)
    platform: str = Field(max_length=100)
    save_to_drive: bool = False


@app.post("/api/download/start")
async def start_download(req: DownloadRequest):
    task_id = str(uuid.uuid4())
    _tasks[task_id] = {"status": "queued", "file_path": None, "error": None, "meta": req.dict()}
    asyncio.create_task(_run_download(task_id, req))
    return {"task_id": task_id}


async def _run_download(task_id: str, req: DownloadRequest):
    _tasks[task_id]["status"] = "downloading"
    try:
        async def on_progress(data: dict):
            _tasks[task_id]["progress"] = data

        file_path = await downloader.download_video(
            url=req.url,
            format_id=req.format_id,
            task_id=task_id,
            on_progress=on_progress,
            cookies_path=_cookies(),
        )
        _tasks[task_id]["file_path"] = str(file_path)

        if req.save_to_drive:
            _tasks[task_id]["status"] = "uploading"
            filename = downloader.clean_filename(req.title, req.platform, req.quality_label)
            drive_url = await drive.upload_to_drive(file_path, filename)
            _tasks[task_id]["drive_url"] = drive_url
            file_path.unlink(missing_ok=True)

        _tasks[task_id]["status"] = "done"

        await database.add_history(
            title=req.title,
            platform=req.platform,
            quality=req.quality_label,
            url=req.url,
            saved_to_drive=req.save_to_drive,
        )

    except Exception as e:
        _tasks[task_id]["status"] = "error"
        _tasks[task_id]["error"] = "Download failed"


@app.websocket("/ws/progress/{task_id}")
async def ws_progress(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        while True:
            task = _tasks.get(task_id)
            if not task:
                await websocket.send_json({"type": "error", "message": "Task not found."})
                break

            status = task["status"]
            payload = {"type": "status", "status": status}

            if "progress" in task:
                payload.update(task["progress"])

            if status == "done":
                payload["drive_url"] = task.get("drive_url")
                await websocket.send_json(payload)
                break

            if status == "error":
                payload["message"] = task.get("error", "Unknown error.")
                await websocket.send_json(payload)
                break

            await websocket.send_json(payload)
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        pass


@app.get("/api/download/file/{task_id}")
async def serve_file(task_id: str):
    task = _tasks.get(task_id)
    if not task or task["status"] != "done":
        raise HTTPException(status_code=404, detail="File not ready.")

    file_path = task.get("file_path")
    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")

    meta = task.get("meta", {})
    filename = downloader.clean_filename(
        meta.get("title", "video"),
        meta.get("platform", "unknown"),
        meta.get("quality_label", "best"),
    )
    return FileResponse(path=file_path, media_type="video/mp4", filename=filename)


@app.delete("/api/download/file/{task_id}")
async def cleanup_file(task_id: str):
    task = _tasks.pop(task_id, None)
    if task and task.get("file_path"):
        Path(task["file_path"]).unlink(missing_ok=True)
    return {"ok": True}


# ── Google Drive ───────────────────────────────────────────────────────────────

@app.get("/api/auth/google")
async def google_auth(response: Response):
    url, state = drive.get_auth_url()
    response.set_cookie("shadowdl_oauth_state", state, httponly=True, samesite="lax", max_age=600, path="/auth/callback")
    response.headers["Cache-Control"] = "no-store"
    return {"auth_url": url}


@app.get("/auth/callback")
async def google_callback(request: Request, code: str, state: str = ""):
    cookie = request.cookies.get("shadowdl_oauth_state", "")
    if not cookie or not state or not secrets.compare_digest(cookie.encode(), state.encode()):
        raise HTTPException(400, "Invalid authorization state")
    try:
        email = await drive.handle_callback(code, state)
    except ValueError:
        raise HTTPException(400, "Invalid or expired authorization state") from None
    response = RedirectResponse(url="http://localhost:3000/?" + urlencode({"drive": "connected", "email": email}))
    response.delete_cookie("shadowdl_oauth_state", path="/auth/callback")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/auth/status")
@app.get("/api/drive/status")
async def drive_status():
    return await drive.get_drive_status()


@app.delete("/api/auth/google")
@app.post("/api/drive/disconnect")
async def drive_disconnect():
    await drive.disconnect()
    return {"ok": True}


# ── Cookies ────────────────────────────────────────────────────────────────────

@app.post("/api/cookies/upload")
async def upload_cookies(file: UploadFile = File(...)):
    content = await file.read(1024 * 1024 + 1)
    if len(content) > 1024 * 1024:
        raise HTTPException(413, "Cookies file is too large")
    dest = Path(COOKIES_PATH)
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as stream:
        os.fchmod(stream.fileno(), 0o600)
        stream.write(content)
    return {"ok": True, "filename": file.filename, "size": len(content)}


@app.delete("/api/cookies")
async def delete_cookies():
    Path(COOKIES_PATH).unlink(missing_ok=True)
    return {"ok": True}


@app.get("/api/cookies/status")
async def cookies_status():
    p = Path(COOKIES_PATH)
    if p.exists():
        return {"active": True, "filename": "cookies.txt", "size": p.stat().st_size}
    return {"active": False, "filename": None, "size": 0}


# ── History ────────────────────────────────────────────────────────────────────

@app.get("/api/history")
async def get_history():
    return await database.get_history()
