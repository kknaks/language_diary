"""Tests for rate limiting middleware."""

import pytest
from httpx import ASGITransport, AsyncClient
from fastapi import FastAPI

from app.middleware.rate_limit import RateLimitMiddleware


def _make_app(requests_per_minute: int = 5) -> FastAPI:
    """Create a minimal FastAPI app with rate limiting."""
    test_app = FastAPI()
    test_app.add_middleware(RateLimitMiddleware, requests_per_minute=requests_per_minute)

    @test_app.get("/test")
    async def test_endpoint():
        return {"ok": True}

    @test_app.get("/health")
    async def health():
        return {"status": "ok"}

    return test_app


@pytest.mark.asyncio
async def test_allows_requests_under_limit():
    app = _make_app(requests_per_minute=10)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for _ in range(5):
            resp = await client.get("/test")
            assert resp.status_code == 200


@pytest.mark.asyncio
async def test_blocks_requests_over_limit():
    app = _make_app(requests_per_minute=3)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for _ in range(3):
            resp = await client.get("/test")
            assert resp.status_code == 200

        # 4th request should be rate limited
        resp = await client.get("/test")
        assert resp.status_code == 429
        data = resp.json()
        assert data["error"]["code"] == "RATE_LIMITED"
        assert "limit=3/min" in data["error"]["detail"]


@pytest.mark.asyncio
async def test_health_endpoint_skips_rate_limit():
    app = _make_app(requests_per_minute=1)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Use up the rate limit
        resp = await client.get("/test")
        assert resp.status_code == 200

        # Health should still work (bypasses rate limit)
        resp = await client.get("/health")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_rate_limit_error_format():
    app = _make_app(requests_per_minute=1)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.get("/test")  # exhaust limit
        resp = await client.get("/test")
        data = resp.json()
        assert "error" in data
        assert "code" in data["error"]
        assert "message" in data["error"]
        assert "detail" in data["error"]
