import pytest


@pytest.mark.asyncio
async def test_get_profile(client, seed_user):
    resp = await client.get("/api/v1/user/profile")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == 1
    assert data["nickname"] == "MVP User"


@pytest.mark.asyncio
async def test_get_profile_not_authenticated(client):
    """Without seed_user (no auth), profile returns 401."""
    resp = await client.get("/api/v1/user/profile")
    assert resp.status_code == 401
