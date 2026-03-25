import aiosqlite
import os
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "shadowdl.db")


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                platform TEXT NOT NULL,
                quality TEXT NOT NULL,
                url TEXT NOT NULL,
                downloaded_at TEXT DEFAULT (datetime('now')),
                saved_to_drive INTEGER DEFAULT 0,
                thumbnail TEXT,
                tags TEXT
            )
        """)
        # Add new columns to existing history table if they don't exist yet
        try:
            await db.execute("ALTER TABLE history ADD COLUMN thumbnail TEXT")
        except Exception:
            pass
        try:
            await db.execute("ALTER TABLE history ADD COLUMN tags TEXT")
        except Exception:
            pass

        await db.execute("""
            CREATE TABLE IF NOT EXISTS oauth_tokens (
                id INTEGER PRIMARY KEY,
                token_data BLOB NOT NULL,
                email TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                format_id TEXT NOT NULL,
                quality_label TEXT NOT NULL,
                save_to_drive INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                cron_expr TEXT NOT NULL,
                format_id TEXT,
                quality_label TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                last_run TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await db.commit()


async def add_history(
    title: str,
    platform: str,
    quality: str,
    url: str,
    saved_to_drive: bool = False,
    thumbnail: str | None = None,
    tags: str | None = None,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO history (title, platform, quality, url, saved_to_drive, thumbnail, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (title, platform, quality, url, int(saved_to_drive), thumbnail, tags),
        )
        await db.commit()


async def get_history():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM history ORDER BY id DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def save_token(token_data: bytes, email: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM oauth_tokens")
        await db.execute(
            "INSERT INTO oauth_tokens (id, token_data, email) VALUES (1, ?, ?)",
            (token_data, email),
        )
        await db.commit()


async def load_token() -> tuple[bytes | None, str | None]:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT token_data, email FROM oauth_tokens WHERE id = 1") as cursor:
            row = await cursor.fetchone()
            if row:
                return row[0], row[1]
            return None, None


async def delete_token():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM oauth_tokens")
        await db.commit()


# ── Presets ───────────────────────────────────────────────────────────────────

async def add_preset(name: str, format_id: str, quality_label: str, save_to_drive: bool = False) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "INSERT INTO presets (name, format_id, quality_label, save_to_drive) VALUES (?, ?, ?, ?)",
            (name, format_id, quality_label, int(save_to_drive)),
        )
        await db.commit()
        async with db.execute("SELECT * FROM presets WHERE id = ?", (cursor.lastrowid,)) as c:
            row = await c.fetchone()
            return dict(row) if row else {}


async def get_presets() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM presets ORDER BY id DESC") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def delete_preset(preset_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM presets WHERE id = ?", (preset_id,))
        await db.commit()


# ── Schedules ─────────────────────────────────────────────────────────────────

async def add_schedule(
    url: str,
    title: str,
    cron_expr: str,
    format_id: str | None,
    quality_label: str,
) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "INSERT INTO schedules (url, title, cron_expr, format_id, quality_label) VALUES (?, ?, ?, ?, ?)",
            (url, title, cron_expr, format_id, quality_label),
        )
        await db.commit()
        async with db.execute("SELECT * FROM schedules WHERE id = ?", (cursor.lastrowid,)) as c:
            row = await c.fetchone()
            return dict(row) if row else {}


async def get_schedules() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM schedules ORDER BY id DESC") as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def delete_schedule(schedule_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
        await db.commit()


async def update_schedule_last_run(schedule_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE schedules SET last_run = datetime('now') WHERE id = ?",
            (schedule_id,),
        )
        await db.commit()


# ── Analytics ─────────────────────────────────────────────────────────────────

async def get_analytics() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Total downloads
        async with db.execute("SELECT COUNT(*) as cnt FROM history") as cursor:
            row = await cursor.fetchone()
            total_downloads = row["cnt"] if row else 0

        # By platform
        by_platform: dict[str, int] = {}
        async with db.execute(
            "SELECT platform, COUNT(*) as cnt FROM history GROUP BY platform"
        ) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                by_platform[r["platform"]] = r["cnt"]

        # By day — last 30 days
        cutoff = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
        by_day: list[dict] = []
        async with db.execute(
            """
            SELECT date(downloaded_at) as day, COUNT(*) as cnt
            FROM history
            WHERE date(downloaded_at) >= ?
            GROUP BY day
            ORDER BY day ASC
            """,
            (cutoff,),
        ) as cursor:
            rows = await cursor.fetchall()
            for r in rows:
                by_day.append({"date": r["day"], "count": r["cnt"]})

        # Drive saves
        async with db.execute(
            "SELECT COUNT(*) as cnt FROM history WHERE saved_to_drive = 1"
        ) as cursor:
            row = await cursor.fetchone()
            drive_saves = row["cnt"] if row else 0

        return {
            "total_downloads": total_downloads,
            "by_platform": by_platform,
            "by_day": by_day,
            "total_size_mb": 0,
            "drive_saves": drive_saves,
        }
