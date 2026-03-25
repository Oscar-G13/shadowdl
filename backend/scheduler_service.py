import asyncio
import uuid
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import database
import downloader

scheduler = AsyncIOScheduler()


async def start():
    scheduler.start()
    schedules = await database.get_schedules()
    for s in schedules:
        if s.get("enabled"):
            _register(s)


def _register(s: dict):
    job_id = f"sched_{s['id']}"
    try:
        parts = s["cron_expr"].split()
        if len(parts) != 5:
            return
        mn, hr, day, mo, dow = parts
        scheduler.add_job(
            _execute,
            CronTrigger(minute=mn, hour=hr, day=day, month=mo, day_of_week=dow),
            args=[s["id"], s["url"], s.get("format_id"), s.get("quality_label", "Best Quality")],
            id=job_id,
            replace_existing=True,
        )
    except Exception as e:
        print(f"[Scheduler] Failed to register job {job_id}: {e}")


async def _execute(schedule_id: int, url: str, format_id: str | None, quality_label: str):
    try:
        meta = await downloader.fetch_metadata(url)
        fid = format_id or "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
        tid = str(uuid.uuid4())

        async def noop(d):
            pass

        await downloader.download_video(url, fid, tid, noop)
        await database.add_history(
            title=meta.get("title", "Scheduled"),
            platform=meta.get("platform", "unknown"),
            quality=quality_label,
            url=url,
            saved_to_drive=False,
        )
        await database.update_schedule_last_run(schedule_id)
        print(f"[Scheduler] Completed schedule {schedule_id}")
    except Exception as e:
        print(f"[Scheduler] Failed schedule {schedule_id}: {e}")


async def add(url: str, title: str, cron_expr: str, format_id: str | None, quality_label: str) -> dict:
    s = await database.add_schedule(url=url, title=title, cron_expr=cron_expr, format_id=format_id, quality_label=quality_label)
    _register(s)
    return s


async def remove(schedule_id: int):
    job_id = f"sched_{schedule_id}"
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass
    await database.delete_schedule(schedule_id)


def next_run(cron_expr: str) -> str | None:
    try:
        mn, hr, day, mo, dow = cron_expr.split()
        trigger = CronTrigger(minute=mn, hour=hr, day=day, month=mo, day_of_week=dow)
        nxt = trigger.get_next_fire_time(None, datetime.now())
        return nxt.isoformat() if nxt else None
    except Exception:
        return None
