"""Unit tests for social auth token verification utilities."""
import base64
import json
from unittest.mock import patch

import pytest

from app.utils.social_auth import verify_apple_token, verify_google_token


def _make_fake_jwt(payload: dict) -> str:
    """Create a fake JWT (header.payload.signature) for dev-mode parsing."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256"}).encode()).rstrip(b"=").decode()
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    sig = base64.urlsafe_b64encode(b"fake_signature").rstrip(b"=").decode()
    return f"{header}.{body}.{sig}"


@pytest.fixture(autouse=True)
def _force_dev_mode(monkeypatch):
    """Force dev mode by clearing GOOGLE_CLIENT_IDS and APPLE_CLIENT_ID."""
    monkeypatch.setattr("app.utils.social_auth.GOOGLE_CLIENT_IDS", [])
    monkeypatch.delenv("APPLE_CLIENT_ID", raising=False)


@pytest.mark.asyncio
class TestVerifyGoogleToken:
    async def test_valid_token_dev_mode(self):
        """Dev mode (GOOGLE_CLIENT_IDS empty): should parse token payload."""
        payload = {"sub": "google_123", "email": "test@gmail.com", "name": "Test User"}
        token = _make_fake_jwt(payload)
        result = await verify_google_token(token)
        assert result is not None
        assert result["sub"] == "google_123"
        assert result["email"] == "test@gmail.com"
        assert result["name"] == "Test User"

    async def test_valid_token_no_name(self):
        """Token without name should return empty string for name."""
        payload = {"sub": "google_456", "email": "noname@gmail.com"}
        token = _make_fake_jwt(payload)
        result = await verify_google_token(token)
        assert result is not None
        assert result["sub"] == "google_456"
        assert result["name"] == ""

    async def test_valid_token_defaults(self):
        """Token with empty payload should use defaults."""
        payload = {}
        token = _make_fake_jwt(payload)
        result = await verify_google_token(token)
        assert result is not None
        assert result["sub"] == "test_google_id"

    async def test_invalid_token_format(self):
        """Non-JWT string should return None."""
        result = await verify_google_token("not-a-jwt")
        assert result is None

    async def test_invalid_token_two_parts(self):
        """Two-part token should return None."""
        result = await verify_google_token("header.payload")
        assert result is None

    async def test_invalid_token_garbage(self):
        """Garbage base64 that can't be decoded should return None."""
        result = await verify_google_token("a.!!!invalid!!!.c")
        assert result is None


@pytest.mark.asyncio
class TestVerifyAppleToken:
    async def test_valid_token(self):
        """Should parse Apple token payload."""
        payload = {"sub": "apple_789", "email": "test@icloud.com"}
        token = _make_fake_jwt(payload)
        result = await verify_apple_token(token)
        assert result is not None
        assert result["sub"] == "apple_789"
        assert result["email"] == "test@icloud.com"

    async def test_valid_token_defaults(self):
        """Empty payload should use defaults."""
        payload = {}
        token = _make_fake_jwt(payload)
        result = await verify_apple_token(token)
        assert result is not None
        assert result["sub"] == "test_apple_id"
        assert result["email"] == ""

    async def test_invalid_token_format(self):
        """Non-JWT string should return None."""
        result = await verify_apple_token("not-a-jwt")
        assert result is None

    async def test_invalid_token_two_parts(self):
        """Two-part token should return None."""
        result = await verify_apple_token("header.payload")
        assert result is None
