import aiosqlite
import os

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
                saved_to_drive INTEGER DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS oauth_tokens (
                id INTEGER PRIMARY KEY,
                token_data BLOB NOT NULL,
                email TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)
        await db.commit()


async def add_history(title: str, platform: str, quality: str, url: str, saved_to_drive: bool = False):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO history (title, platform, quality, url, saved_to_drive) VALUES (?, ?, ?, ?, ?)",
            (title, platform, quality, url, int(saved_to_drive)),
        )
        # Keep only the last 20 entries
        await db.execute("""
            DELETE FROM history WHERE id NOT IN (
                SELECT id FROM history ORDER BY id DESC LIMIT 20
            )
        """)
        await db.commit()


async def get_history():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT 20"
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
