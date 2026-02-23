"""Request/Response logging middleware with structured output."""

import logging
import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("language_diary.access")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every HTTP request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        method = request.method
        path = request.url.path

        # Skip noisy health-check logs
        if path == "/health":
            return await call_next(request)

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.monotonic() - start) * 1000
            logger.error(
                "%s %s 500 %.1fms (unhandled exception)",
                method, path, duration_ms,
            )
            raise

        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            "%s %s %d %.1fms",
            method, path, response.status_code, duration_ms,
        )
        return response
