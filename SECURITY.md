# Single-user local access

ShadowDL holds one user's browser cookies and Google Drive grant. Its API is
restricted to loopback clients, loopback Host headers, and the local frontend
origins on port 3000. Foreign browser origins, cross-site API requests, and
remote clients are rejected. Keep Uvicorn bound to `127.0.0.1`, with proxy-header
trust disabled (`--no-proxy-headers`). Do not expose it through a public reverse
proxy or tunnel: a multi-user deployment needs a separate authenticated design.

Set a stable Fernet `ENCRYPTION_KEY` in the private `.env` before connecting
Drive. Missing keys now fail closed; generated keys are never printed to logs.
Existing encrypted tokens continue to use the configured key. If a previous
version printed a real key to shared logs, rotate that key and reconnect Drive.

OAuth authorization uses a ten-minute, single-use state bound to an HttpOnly
browser cookie. Video inputs must be HTTP(S) URLs and cannot become downloader
command options. Cookie uploads are limited to 1 MiB and saved with owner-only
permissions. Use the pinned backend `requirements.txt`; startup no longer
updates the downloader outside the reviewed dependency graph.

Run `python -m unittest discover -s backend/tests -v` with backend dependencies
installed. These checks stub OAuth exchange and never access a real Drive.
This audit patched repository source; it did not start or expose ShadowDL.
