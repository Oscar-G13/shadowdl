import asyncio
import contextlib
import io
import os
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-only.apps.googleusercontent.com")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-only-not-deployed")
from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient
from security import LocalAccessOnly, validate_video_url
import drive
import main

class AccessBoundary(unittest.TestCase):
    def test_remote_client_and_rebinding_host_are_denied(self):
        app = FastAPI()
        app.add_middleware(LocalAccessOnly)
        @app.get("/")
        def root(): return {"ok": True}
        self.assertEqual(TestClient(app, base_url="http://localhost", client=("203.0.113.5", 123)).get("/").status_code, 403)
        self.assertEqual(TestClient(app, base_url="http://attacker.invalid", client=("127.0.0.1", 123)).get("/").status_code, 403)
        self.assertEqual(TestClient(app, base_url="http://localhost", client=("127.0.0.1", 123)).get("/").status_code, 200)

    def test_foreign_browser_origin_cannot_read_history(self):
        client = TestClient(main.app, base_url="http://localhost", client=("127.0.0.1", 123))
        with patch.object(main.database, "get_history", new_callable=AsyncMock) as history:
            self.assertEqual(client.get("/api/history", headers={"Origin": "https://attacker.invalid"}).status_code, 403)
            self.assertEqual(client.get("/api/history", headers={"Sec-Fetch-Site": "cross-site"}).status_code, 403)
            history.assert_not_called()

    def test_oauth_callback_requires_browser_bound_state(self):
        client = TestClient(main.app, base_url="http://localhost", client=("127.0.0.1", 123))
        with patch.object(main.drive, "handle_callback", new_callable=AsyncMock) as exchange:
            response = client.get("/auth/callback?code=test&state=unrequested", headers={"Sec-Fetch-Site": "cross-site"})
            self.assertEqual(response.status_code, 400)
            exchange.assert_not_called()

    def test_video_inputs_cannot_be_command_options_or_file_urls(self):
        for value in ["--exec=anything", "file:///etc/passwd", "http://user:password@example.com", "not a URL"]:
            with self.assertRaises(ValueError): validate_video_url(value)
        self.assertEqual(validate_video_url("https://example.com/video?id=1"), "https://example.com/video?id=1")

class OAuthBoundary(unittest.IsolatedAsyncioTestCase):
    async def test_expired_and_reused_state_never_exchange(self):
        flow = Mock()
        drive._pending_flows.clear()
        drive._pending_flows["expired"] = (time.monotonic() - 1, flow)
        for state in ["expired", "unknown"]:
            with self.assertRaises(ValueError): await drive.handle_callback("test-code", state)
        flow.fetch_token.assert_not_called()

    async def test_valid_state_is_consumed_once_and_tokens_are_encrypted(self):
        flow = Mock()
        flow.credentials.token = "test-access-only"
        flow.credentials.refresh_token = "test-refresh-only"
        flow.credentials.token_uri = "https://oauth2.googleapis.com/token"
        flow.credentials.client_id = "test-client"
        flow.credentials.client_secret = "test-client-secret"
        flow.credentials.scopes = drive.SCOPES
        drive._pending_flows["single-use"] = (time.monotonic() + 60, flow)
        drive._fernet.cache_clear()
        with patch.dict(os.environ, {"ENCRYPTION_KEY": Fernet.generate_key().decode()}), patch.object(drive, "build", side_effect=RuntimeError("no network")), patch.object(drive, "save_token", new_callable=AsyncMock) as saved:
            await drive.handle_callback("test-code", "single-use")
            self.assertNotIn(b"test-access-only", saved.call_args.args[0])
            with self.assertRaises(ValueError): await drive.handle_callback("test-code", "single-use")
        flow.fetch_token.assert_called_once()
        drive._fernet.cache_clear()

    async def test_missing_encryption_key_fails_without_logging_a_secret(self):
        drive._fernet.cache_clear()
        output = io.StringIO()
        with patch.dict(os.environ, {"ENCRYPTION_KEY": ""}), contextlib.redirect_stdout(output):
            with self.assertRaises(RuntimeError): drive._fernet()
        self.assertEqual(output.getvalue(), "")

if __name__ == "__main__": unittest.main()
