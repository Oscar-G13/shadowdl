import json
import os
import time
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

from database import delete_token, load_token, save_token

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]

CLIENT_CONFIG = {
    "web": {
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [
            "http://localhost:8000/auth/callback",
            "http://localhost:3000/api/auth/callback",
        ],
    }
}

REDIRECT_URI = "http://localhost:8000/auth/callback"


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("Set ENCRYPTION_KEY in your private .env before connecting Drive")
    return Fernet(key.encode())


def _encrypt(data: dict) -> bytes:
    return _fernet().encrypt(json.dumps(data).encode())


def _decrypt(blob: bytes) -> dict:
    return json.loads(_fernet().decrypt(blob).decode())


_pending_flows: dict = {}


def get_auth_url() -> tuple[str, str]:
    _fernet()
    now = time.monotonic()
    for old in list(_pending_flows):
        if _pending_flows[old][0] < now:
            del _pending_flows[old]
    if len(_pending_flows) >= 20:
        raise ValueError("Too many pending authorization attempts")
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    _pending_flows[state] = (now + 600, flow)
    return auth_url, state


async def handle_callback(code: str, state: str) -> str:
    """Exchange auth code for tokens, encrypt and persist. Returns user email."""
    pending = _pending_flows.pop(state, None)
    if pending is None or pending[0] < time.monotonic():
        raise ValueError("Invalid or expired authorization state")
    flow = pending[1]
    flow.fetch_token(code=code)

    creds = flow.credentials
    token_dict = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES,
    }

    # Get the user's email from the ID token
    email = "unknown"
    try:
        service = build("oauth2", "v2", credentials=creds)
        info = service.userinfo().get().execute()
        email = info.get("email", "unknown")
    except Exception:
        pass

    encrypted = _encrypt(token_dict)
    await save_token(encrypted, email)
    return email


async def get_credentials() -> Credentials | None:
    blob, _ = await load_token()
    if not blob:
        return None
    token_dict = _decrypt(blob)
    return Credentials(
        token=token_dict["token"],
        refresh_token=token_dict.get("refresh_token"),
        token_uri=token_dict["token_uri"],
        client_id=token_dict["client_id"],
        client_secret=token_dict["client_secret"],
        scopes=token_dict.get("scopes", SCOPES),
    )


async def get_drive_status() -> dict:
    _, email = await load_token()
    return {"connected": email is not None, "email": email}


async def disconnect():
    await delete_token()


async def upload_to_drive(file_path: Path, filename: str) -> str:
    """Upload file to a ShadowDL folder in the user's Drive. Returns the file URL."""
    creds = await get_credentials()
    if not creds:
        raise RuntimeError("Google Drive is not connected.")

    service = build("drive", "v3", credentials=creds)

    # Find or create the ShadowDL folder
    folder_id = await _get_or_create_folder(service, "ShadowDL")

    media = MediaFileUpload(str(file_path), mimetype="video/mp4", resumable=True)
    file_meta = {"name": filename, "parents": [folder_id]}

    uploaded = service.files().create(
        body=file_meta,
        media_body=media,
        fields="id, webViewLink",
    ).execute()

    return uploaded.get("webViewLink", "")


async def _get_or_create_folder(service, name: str) -> str:
    query = f"mimeType='application/vnd.google-apps.folder' and name='{name}' and trashed=false"
    results = service.files().list(q=query, fields="files(id)").execute()
    folders = results.get("files", [])

    if folders:
        return folders[0]["id"]

    folder_meta = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    folder = service.files().create(body=folder_meta, fields="id").execute()
    return folder["id"]
