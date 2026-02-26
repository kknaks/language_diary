"""JWT utility — access/refresh token helpers.

Depends on ``python-jose[cryptography]`` (already installed).
"""
import hashlib
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt

SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me-in-production")
ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
REFRESH_TOKEN_EXPIRE_DAYS: int = 30


def create_access_token(user_id: int, onboarding_completed: bool = False) -> str:
    """Return a signed JWT containing ``sub=<user_id>``."""
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire, "ob": onboarding_completed}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token() -> str:
    """Return a random 32-byte hex string for use as a refresh token."""
    return secrets.token_hex(32)


def verify_access_token(token: str) -> Optional[int]:
    """Decode *token* and return the ``user_id`` (int) or ``None`` on failure."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            return None
        return int(sub)
    except (JWTError, ValueError):
        return None


def hash_refresh_token(token: str) -> str:
    """Return the SHA-256 hex digest of *token*."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
