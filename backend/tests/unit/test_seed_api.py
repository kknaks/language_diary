"""Unit tests for seed data API endpoints (languages, avatars, voices)."""
import pytest
import pytest_asyncio
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.seed import Avatar, Language, Voice
from app.models.user import User
from app.utils.jwt import create_access_token


@pytest_asyncio.fixture
async def seed_api_user(db_session: AsyncSession):
    user = User(id=200, nickname="SeedUser", native_lang="ko", target_lang="en",
                created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def seed_languages(db_session: AsyncSession):
    langs = [
        Language(id=1, code="ko", name_native="한국어", is_active=True),
        Language(id=2, code="en", name_native="English", is_active=True),
    ]
    db_session.add_all(langs)
    await db_session.commit()
    return langs


@pytest_asyncio.fixture
async def seed_avatars(db_session: AsyncSession):
    avs = [
        Avatar(id=1, name="Luna", thumbnail_url="/static/avatars/luna.png",
               primary_color="#6C63FF", is_active=True),
    ]
    db_session.add_all(avs)
    await db_session.commit()
    return avs


@pytest_asyncio.fixture
async def seed_voices(db_session: AsyncSession, seed_languages):
    voices = [
        Voice(id=1, language_id=2, name="Sarah", gender="female", tone="활발한",
              elevenlabs_voice_id="EXAVITQu4vr4xnSDxMaL", is_active=True),
        Voice(id=2, language_id=1, name="Jimin", gender="male", tone="차분한",
              elevenlabs_voice_id="abc123", is_active=True),
    ]
    db_session.add_all(voices)
    await db_session.commit()
    return voices


def _auth_header(user_id: int):
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
class TestLanguagesEndpoint:
    async def test_list_languages(self, client, seed_api_user, seed_languages):
        resp = await client.get("/api/v1/languages", headers=_auth_header(seed_api_user.id))
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert len(data["items"]) == 2

    async def test_no_auth(self, client):
        resp = await client.get("/api/v1/languages")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestAvatarsEndpoint:
    async def test_list_avatars(self, client, seed_api_user, seed_avatars):
        resp = await client.get("/api/v1/avatars", headers=_auth_header(seed_api_user.id))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "Luna"


@pytest.mark.asyncio
class TestVoicesEndpoint:
    async def test_list_voices(self, client, seed_api_user, seed_voices):
        resp = await client.get("/api/v1/voices", headers=_auth_header(seed_api_user.id))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 2
        # ensure elevenlabs_voice_id is NOT in the response
        for item in data["items"]:
            assert "elevenlabs_voice_id" not in item

    async def test_filter_by_language(self, client, seed_api_user, seed_voices):
        resp = await client.get("/api/v1/voices?language_id=2", headers=_auth_header(seed_api_user.id))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "Sarah"
