"""ShadowDL is a single-user loopback application, not a public service."""
import ipaddress
from urllib.parse import urlsplit
from starlette.responses import JSONResponse

LOCAL_ORIGINS = {"http://localhost:3000", "http://127.0.0.1:3000"}


class LocalAccessOnly:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"}:
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        try:
            local = ipaddress.ip_address(scope.get("client", ("", 0))[0]).is_loopback
            host = urlsplit("http://" + headers.get(b"host", b"").decode()).hostname
        except (ValueError, UnicodeError, TypeError):
            local, host = False, None
        origin = headers.get(b"origin", b"").decode(errors="replace")
        foreign_site = headers.get(b"sec-fetch-site", b"") == b"cross-site"
        callback = scope["type"] == "http" and scope["path"] == "/auth/callback" and scope["method"] == "GET"
        allowed = local and host in {"localhost", "127.0.0.1", "::1"}
        allowed = allowed and (not origin or origin in LOCAL_ORIGINS)
        allowed = allowed and (not foreign_site or callback)
        if scope["type"] == "websocket":
            allowed = allowed and origin in LOCAL_ORIGINS
        if not allowed:
            if scope["type"] == "websocket":
                return await send({"type": "websocket.close", "code": 1008})
            return await JSONResponse({"detail": "Local access only"}, status_code=403)(scope, receive, send)
        await self.app(scope, receive, send)


def validate_video_url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or len(value) > 4096:
            raise ValueError
        parsed.port
    except ValueError:
        raise ValueError("A valid HTTP or HTTPS video URL is required") from None
    return value
