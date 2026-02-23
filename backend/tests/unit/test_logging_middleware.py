"""Tests for request/response logging middleware."""

import logging
import pytest
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI

from app.middleware.logging import RequestLoggingMiddleware


def _make_app() -> FastAPI:
    test_app = FastAPI()
    test_app.add_middleware(RequestLoggingMiddleware)

    @test_app.get("/test")
    async def test_endpoint():
        return {"ok": True}

    @test_app.get("/health")
    async def health():
        return {"status": "ok"}

    @test_app.get("/error")
    async def error_endpoint():
        raise ValueError("test error")

    return test_app


@pytest.mark.asyncio
async def test_logs_request(caplog):
    app = _make_app()
    with caplog.at_level(logging.INFO, logger="language_diary.access"):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.get("/test")

    assert any("GET /test 200" in record.message for record in caplog.records)


@pytest.mark.asyncio
async def test_skips_health_logging(caplog):
    app = _make_app()
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="language_diary.access"):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.get("/health")

    # Only check records from our logger, not from the main app
    access_records = [r for r in caplog.records if r.name == "language_diary.access"]
    assert not any("/health" in record.message for record in access_records)


@pytest.mark.asyncio
async def test_logs_duration(caplog):
    app = _make_app()
    with caplog.at_level(logging.INFO, logger="language_diary.access"):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.get("/test")

    # Check that the log contains ms duration
    log_messages = [r.message for r in caplog.records if "/test" in r.message]
    assert len(log_messages) >= 1
    assert "ms" in log_messages[0]
