"""Tests for GET /api/v1/home endpoint."""

import pytest
from datetime import datetime


@pytest.mark.asyncio
async def test_get_home_success(client, seed_user):
    """Home endpoint returns user info and empty diary stats."""
    resp = await client.get("/api/v1/home")
    assert resp.status_code == 200
    data = resp.json()

    # User info
    assert data["user"]["nickname"] == "MVP User"

    # Stats
    assert data["stats"]["total_diaries"] == 0
    assert data["stats"]["streak_days"] == 0
    assert data["stats"]["today_completed"] is False

    # No recent diaries
    assert data["recent_diaries"] == []


@pytest.mark.asyncio
async def test_get_home_with_diaries(client, seed_diary):
    """Home endpoint returns recent diary and stats."""
    resp = await client.get("/api/v1/home")
    assert resp.status_code == 200
    data = resp.json()

    assert data["stats"]["total_diaries"] == 1
    assert len(data["recent_diaries"]) == 1
    assert data["recent_diaries"][0]["original_text"] == "오늘 회사에서 회의했어"


@pytest.mark.asyncio
async def test_get_home_unauthenticated(client):
    """Home endpoint without auth returns 401."""
    resp = await client.get("/api/v1/home")
    assert resp.status_code == 401
