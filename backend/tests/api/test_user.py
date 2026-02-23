import pytest


@pytest.mark.asyncio
async def test_get_current_user(client, seed_user):
    resp = await client.get("/api/v1/user/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == 1
    assert data["nickname"] == "MVP User"
    assert data["native_lang"] == "ko"
    assert data["target_lang"] == "en"


@pytest.mark.asyncio
async def test_get_current_user_not_found(client):
    resp = await client.get("/api/v1/user/me")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"]["code"] == "USER_NOT_FOUND"
