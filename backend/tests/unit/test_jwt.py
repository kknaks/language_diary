"""Unit tests for app.utils.jwt module."""
import time

from jose import jwt as jose_jwt

from app.utils.jwt import (
    ALGORITHM,
    SECRET_KEY,
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    verify_access_token,
)


class TestCreateAccessToken:
    def test_returns_string(self):
        token = create_access_token(user_id=42)
        assert isinstance(token, str)
        assert len(token) > 0

    def test_contains_sub_claim(self):
        token = create_access_token(user_id=7)
        payload = jose_jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "7"

    def test_contains_exp_claim(self):
        token = create_access_token(user_id=1)
        payload = jose_jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload


class TestVerifyAccessToken:
    def test_valid_token(self):
        token = create_access_token(user_id=99)
        result = verify_access_token(token)
        assert result == 99

    def test_expired_token(self):
        """Manually craft an expired token."""
        payload = {"sub": "1", "exp": int(time.time()) - 10}
        token = jose_jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        assert verify_access_token(token) is None

    def test_invalid_token(self):
        assert verify_access_token("not.a.token") is None

    def test_missing_sub(self):
        payload = {"exp": int(time.time()) + 3600}
        token = jose_jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        assert verify_access_token(token) is None

    def test_wrong_secret(self):
        payload = {"sub": "1", "exp": int(time.time()) + 3600}
        token = jose_jwt.encode(payload, "wrong-secret", algorithm=ALGORITHM)
        assert verify_access_token(token) is None


class TestRefreshToken:
    def test_create_returns_hex(self):
        token = create_refresh_token()
        assert isinstance(token, str)
        assert len(token) == 64  # 32 bytes -> 64 hex chars
        int(token, 16)  # should not raise

    def test_hash_consistency(self):
        token = create_refresh_token()
        h1 = hash_refresh_token(token)
        h2 = hash_refresh_token(token)
        assert h1 == h2

    def test_different_tokens_different_hashes(self):
        t1 = create_refresh_token()
        t2 = create_refresh_token()
        assert hash_refresh_token(t1) != hash_refresh_token(t2)
