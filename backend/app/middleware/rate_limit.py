"""Simple in-memory rate limiting middleware.

Uses a sliding window approach to limit requests per IP address.
For production with multiple workers, replace with Redis-backed storage.
"""

import time
from collections import defaultdict
from typing import Dict, List, Tuple

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate-limit requests per IP with a sliding window counter.

    Args:
        app: ASGI application
        requests_per_minute: Maximum requests allowed per minute per IP
    """

    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.window_seconds = 60
        # ip -> list of request timestamps
        self._requests: Dict[str, List[float]] = defaultdict(list)

    def _clean_old_entries(self, ip: str, now: float) -> None:
        """Remove timestamps outside the current window."""
        cutoff = now - self.window_seconds
        self._requests[ip] = [
            ts for ts in self._requests[ip] if ts > cutoff
        ]

    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks and WebSocket upgrades
        if request.url.path == "/health":
            return await call_next(request)
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()

        self._clean_old_entries(ip, now)

        if len(self._requests[ip]) >= self.requests_per_minute:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": {
                        "code": "RATE_LIMITED",
                        "message": "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
                        "detail": f"limit={self.requests_per_minute}/min",
                    }
                },
            )

        self._requests[ip].append(now)
        return await call_next(request)
