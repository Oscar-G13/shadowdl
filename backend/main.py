import asyncio
import json
import os
import re
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

import database
import downloader
import drive
import ai_assistant
import video_toolkit
import scheduler_service
import studio

app = FastAPI(title="ShadowDL API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory task registry: task_id -> { status, file_path, error, meta }
_tasks: dict[str, dict] = {}

# In-memory batch registry: batch_id -> { status, items: [...] }
_batches: dict[str, dict] = {}


@app.on_event("startup")
async def startup():
    await database.init_db()
    await scheduler_service.start()


# ── Metadata ──────────────────────────────────────────────────────────────────

class MetadataRequest(BaseModel):
    url: str
    allow_playlist: bool = False


@app.post("/api/metadata")
async def get_metadata(req: MetadataRequest):
    try:
        meta = await downloader.fetch_metadata(req.url, allow_playlist=req.allow_playlist)
        return meta
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)[:200]}")


# ── Download ──────────────────────────────────────────────────────────────────

class DownloadRequest(BaseModel):
    url: str
    format_id: str
    quality_label: str
    title: str
    platform: str
    save_to_drive: bool = False
    proxy: str | None = None


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
            proxy=req.proxy,
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
        _tasks[task_id]["error"] = str(e)


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

    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        filename=filename,
    )


# Cleanup temp file after serving — called by frontend after download completes
@app.delete("/api/download/file/{task_id}")
async def cleanup_file(task_id: str):
    task = _tasks.pop(task_id, None)
    if task and task.get("file_path"):
        Path(task["file_path"]).unlink(missing_ok=True)
    return {"ok": True}


# ── Google Drive Auth ─────────────────────────────────────────────────────────

@app.get("/api/auth/google")
async def google_auth():
    url = drive.get_auth_url()
    return {"auth_url": url}


@app.get("/auth/callback")
async def google_callback(code: str, state: str = ""):
    email = await drive.handle_callback(code)
    return RedirectResponse(url=f"http://localhost:3000?drive=connected&email={email}")


@app.get("/api/auth/status")
async def drive_status():
    return await drive.get_drive_status()


@app.delete("/api/auth/google")
async def google_disconnect():
    await drive.disconnect()
    return {"ok": True}


# ── History ───────────────────────────────────────────────────────────────────

@app.get("/api/history")
async def get_history():
    return await database.get_history()


# ── AI Assistant ──────────────────────────────────────────────────────────────

class AIRecommendRequest(BaseModel):
    url: str | None = None
    metadata: dict
    intent: str


@app.post("/api/ai/recommend")
async def ai_recommend(req: AIRecommendRequest):
    try:
        result = await ai_assistant.recommend_format(req.metadata, req.intent)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI recommendation failed: {str(e)[:200]}")


# ── Subtitles ─────────────────────────────────────────────────────────────────

class SubtitleDownloadRequest(BaseModel):
    url: str
    task_id: str | None = None


@app.post("/api/subtitles/download")
async def subtitle_download(req: SubtitleDownloadRequest):
    try:
        task_id = req.task_id or str(uuid.uuid4())
        srt_path = await downloader.download_subtitles(req.url, task_id)
        if srt_path and srt_path.exists():
            srt_content = srt_path.read_text(encoding="utf-8", errors="replace")
            return {"srt_content": srt_content, "found": True}
        return {"srt_content": "", "found": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Subtitle download failed: {str(e)[:200]}")


class SubtitleTranslateRequest(BaseModel):
    srt_content: str
    target_language: str


@app.post("/api/subtitles/translate")
async def subtitle_translate(req: SubtitleTranslateRequest):
    try:
        translated = await ai_assistant.translate_srt(req.srt_content, req.target_language)
        return {"translated": translated}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)[:200]}")


# ── Video Toolkit ─────────────────────────────────────────────────────────────

UPLOAD_DIR = Path(__file__).parent / "tmp" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/api/toolkit/upload")
async def toolkit_upload(file: UploadFile = File(...)):
    """Accept a user-uploaded video file for toolkit processing."""
    safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename or "upload")
    dest = UPLOAD_DIR / f"{uuid.uuid4()}_{safe_name}"
    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)
    return {"path": str(dest)}


class ToolkitProcessRequest(BaseModel):
    file_path: str
    operation: str
    options: dict = {}


@app.post("/api/toolkit/process")
async def toolkit_process(req: ToolkitProcessRequest):
    """Process an uploaded file directly (no task_id lookup needed)."""
    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")
    toolkit_task_id = str(uuid.uuid4())
    asyncio.create_task(
        video_toolkit.run_operation(
            input_path=req.file_path,
            operation=req.operation,
            options=req.options,
            task_id=toolkit_task_id,
        )
    )
    return {"toolkit_task_id": toolkit_task_id}


class ToolkitStartRequest(BaseModel):
    file_task_id: str
    operation: str
    options: dict = {}


@app.post("/api/toolkit/start")
async def toolkit_start(req: ToolkitStartRequest):
    task = _tasks.get(req.file_task_id)
    if not task or not task.get("file_path"):
        raise HTTPException(status_code=404, detail="Source file task not found or not ready.")

    file_path = task["file_path"]
    toolkit_task_id = str(uuid.uuid4())

    asyncio.create_task(
        video_toolkit.run_operation(
            input_path=file_path,
            operation=req.operation,
            options=req.options,
            task_id=toolkit_task_id,
        )
    )

    return {"toolkit_task_id": toolkit_task_id}


@app.get("/api/toolkit/status/{task_id}")
async def toolkit_status(task_id: str):
    task = video_toolkit.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Toolkit task not found.")
    return task


@app.get("/api/toolkit/file/{task_id}")
async def toolkit_file(task_id: str):
    task = video_toolkit.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Toolkit task not found.")
    if task.get("status") != "done":
        raise HTTPException(status_code=400, detail="Toolkit task not complete.")
    output = task.get("output")
    if not output or not Path(output).exists():
        raise HTTPException(status_code=404, detail="Output file not found.")
    return FileResponse(path=output, filename=Path(output).name)


# ── Batch Downloads ───────────────────────────────────────────────────────────

class BatchItem(BaseModel):
    url: str
    format_id: str
    quality_label: str
    title: str
    platform: str
    save_to_drive: bool = False


class BatchStartRequest(BaseModel):
    items: list[BatchItem]
    proxy: str | None = None


@app.post("/api/batch/start")
async def batch_start(req: BatchStartRequest):
    batch_id = str(uuid.uuid4())
    items = []
    for item in req.items:
        item_id = str(uuid.uuid4())
        items.append({
            "id": item_id,
            "url": item.url,
            "title": item.title,
            "platform": item.platform,
            "status": "queued",
            "task_id": item_id,
            "error": None,
        })

    _batches[batch_id] = {"status": "running", "items": items}

    for i, item in enumerate(req.items):
        item_id = items[i]["id"]
        asyncio.create_task(
            _run_batch_item(batch_id, item_id, item, req.proxy)
        )

    return {"batch_id": batch_id}


async def _run_batch_item(batch_id: str, item_id: str, item: BatchItem, proxy: str | None):
    batch = _batches.get(batch_id)
    if not batch:
        return

    # Find this item in the batch
    batch_item = next((i for i in batch["items"] if i["id"] == item_id), None)
    if not batch_item:
        return

    batch_item["status"] = "downloading"

    try:
        task_id = item_id

        async def on_progress(data: dict):
            batch_item["progress"] = data

        file_path = await downloader.download_video(
            url=item.url,
            format_id=item.format_id,
            task_id=task_id,
            on_progress=on_progress,
            proxy=proxy,
        )

        # Store in _tasks so the file can be served if needed
        _tasks[task_id] = {
            "status": "done",
            "file_path": str(file_path),
            "error": None,
            "meta": item.dict(),
        }

        if item.save_to_drive:
            batch_item["status"] = "uploading"
            filename = downloader.clean_filename(item.title, item.platform, item.quality_label)
            drive_url = await drive.upload_to_drive(file_path, filename)
            batch_item["drive_url"] = drive_url
            file_path.unlink(missing_ok=True)

        batch_item["status"] = "done"

        await database.add_history(
            title=item.title,
            platform=item.platform,
            quality=item.quality_label,
            url=item.url,
            saved_to_drive=item.save_to_drive,
        )

    except Exception as e:
        batch_item["status"] = "error"
        batch_item["error"] = str(e)

    # Update overall batch status
    all_items = batch["items"]
    statuses = [i["status"] for i in all_items]
    if all(s in ("done", "error") for s in statuses):
        batch["status"] = "done"


@app.get("/api/batch/{batch_id}")
async def batch_status(batch_id: str):
    batch = _batches.get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="Batch not found.")
    return batch


# ── Presets ───────────────────────────────────────────────────────────────────

class PresetRequest(BaseModel):
    name: str
    format_id: str
    quality_label: str
    save_to_drive: bool = False


@app.post("/api/presets")
async def create_preset(req: PresetRequest):
    try:
        preset = await database.add_preset(
            name=req.name,
            format_id=req.format_id,
            quality_label=req.quality_label,
            save_to_drive=req.save_to_drive,
        )
        return preset
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create preset: {str(e)[:200]}")


@app.get("/api/presets")
async def list_presets():
    return await database.get_presets()


@app.delete("/api/presets/{preset_id}")
async def remove_preset(preset_id: int):
    await database.delete_preset(preset_id)
    return {"ok": True}


# ── Schedules ─────────────────────────────────────────────────────────────────

class ScheduleRequest(BaseModel):
    url: str
    title: str
    cron_expr: str
    format_id: str | None = None
    quality_label: str = "Best Quality"


@app.post("/api/schedules")
async def create_schedule(req: ScheduleRequest):
    try:
        s = await scheduler_service.add(
            url=req.url,
            title=req.title,
            cron_expr=req.cron_expr,
            format_id=req.format_id,
            quality_label=req.quality_label,
        )
        s["next_run"] = scheduler_service.next_run(req.cron_expr)
        return s
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create schedule: {str(e)[:200]}")


@app.get("/api/schedules")
async def list_schedules():
    schedules = await database.get_schedules()
    for s in schedules:
        s["next_run"] = scheduler_service.next_run(s.get("cron_expr", ""))
    return schedules


@app.delete("/api/schedules/{schedule_id}")
async def remove_schedule(schedule_id: int):
    await scheduler_service.remove(schedule_id)
    return {"ok": True}


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.get("/api/analytics")
async def get_analytics():
    return await database.get_analytics()


# ── Shadow Studio ──────────────────────────────────────────────────────────────

class StudioTranscribeRequest(BaseModel):
    file_path: str


@app.post("/api/studio/transcribe")
async def studio_transcribe(req: StudioTranscribeRequest):
    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")
    task_id = str(uuid.uuid4())
    asyncio.create_task(studio.transcribe_video(req.file_path, task_id))
    return {"task_id": task_id}


@app.get("/api/studio/transcribe-status/{task_id}")
async def studio_transcribe_status(task_id: str):
    task = studio.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


class StudioBurnRequest(BaseModel):
    file_path: str
    segments: list[dict]
    style: str = "default"


@app.post("/api/studio/burn")
async def studio_burn(req: StudioBurnRequest):
    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")
    task_id = str(uuid.uuid4())
    asyncio.create_task(studio.burn_subtitles(req.file_path, req.segments, req.style, task_id))
    return {"task_id": task_id}


class StudioExportRequest(BaseModel):
    file_path: str
    edits: dict


@app.post("/api/studio/export")
async def studio_export(req: StudioExportRequest):
    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")
    task_id = str(uuid.uuid4())
    asyncio.create_task(studio.export_edit(req.file_path, req.edits, task_id))
    return {"task_id": task_id}


class StudioMagicRequest(BaseModel):
    file_path: str
    preset: str  # viral_tiktok, youtube_short, podcast_clean


@app.post("/api/studio/magic")
async def studio_magic(req: StudioMagicRequest):
    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found.")
    task_id = str(uuid.uuid4())

    if req.preset == "viral_tiktok":
        asyncio.create_task(studio.magic_viral_tiktok(req.file_path, task_id))
    elif req.preset == "youtube_short":
        asyncio.create_task(studio.magic_youtube_short(req.file_path, task_id))
    elif req.preset == "podcast_clean":
        asyncio.create_task(studio.magic_podcast_clean(req.file_path, task_id))
    else:
        raise HTTPException(status_code=400, detail=f"Unknown preset: {req.preset}")

    return {"task_id": task_id}


@app.get("/api/studio/status/{task_id}")
async def studio_status(task_id: str):
    task = studio.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


@app.get("/api/studio/file/{task_id}")
async def studio_file(task_id: str):
    task = studio.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    if task.get("status") != "done":
        raise HTTPException(status_code=400, detail="Task not complete.")
    output = task.get("output")
    if not output or not Path(output).exists():
        raise HTTPException(status_code=404, detail="Output file not found.")
    ext = task.get("ext", "mp4")
    media_type = "audio/mpeg" if ext == "mp3" else "video/mp4"
    return FileResponse(path=output, filename=Path(output).name, media_type=media_type)


class StudioSuggestRequest(BaseModel):
    metadata: dict = {}
    segments: list[dict] = []


@app.post("/api/studio/suggest")
async def studio_suggest(req: StudioSuggestRequest):
    task_id = str(uuid.uuid4())
    asyncio.create_task(studio.ai_magic_suggest(req.metadata, req.segments, task_id))
    return {"task_id": task_id}


@app.websocket("/ws/studio/{task_id}")
async def ws_studio_progress(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        while True:
            task = studio.get_task(task_id)
            if task is None:
                await websocket.send_json({"type": "error", "message": "Task not found."})
                break
            status = task.get("status", "processing")
            percent = task.get("percent", 0)
            step = task.get("step", "")
            payload: dict = {"type": "progress", "status": status, "percent": percent, "step": step}
            if status == "done":
                payload["output"] = task.get("output")
                payload["ext"] = task.get("ext", "mp4")
                await websocket.send_json(payload)
                break
            if status == "error":
                payload["message"] = task.get("error", "Unknown error.")
                await websocket.send_json(payload)
                break
            await websocket.send_json(payload)
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        pass
