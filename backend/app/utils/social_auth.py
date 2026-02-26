"""소셜 로그인 ID 토큰 검증 유틸리티."""
import os
import json
import base64
from typing import Optional

import httpx
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from jose import jwt, JWTError
from jose.utils import base64url_decode
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicNumbers
from cryptography.hazmat.backends import default_backend

# ───────────────────────────── Google ──────────────────────────────

import logging

_logger = logging.getLogger(__name__)

_google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_IDS = [_google_client_id] if _google_client_id else []


async def verify_google_token(token: str) -> Optional[dict]:
    """
    Google id_token 검증.
    반환: {"sub": "...", "email": "...", "name": "..."} 또는 None
    GOOGLE_CLIENT_ID 미설정 시 개발 모드 (파싱만, 검증 스킵).
    """
    try:
        if not GOOGLE_CLIENT_IDS:
            parts = token.split(".")
            if len(parts) != 3:
                return None
            padding = 4 - len(parts[1]) % 4
            payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * padding).decode())
            return {
                "sub": payload.get("sub", "test_google_id"),
                "email": payload.get("email", ""),
                "name": payload.get("name", ""),
            }
        idinfo = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_IDS[0]
        )
        return {
            "sub": idinfo["sub"],
            "email": idinfo.get("email", ""),
            "name": idinfo.get("name", ""),
        }
    except Exception as e:
        _logger.error("[Google Auth] verify failed: %s", e)
        return None


# ───────────────────────────── Kakao ──────────────────────────────

KAKAO_USER_INFO_URL = "https://kapi.kakao.com/v2/user/me"


async def verify_kakao_token(access_token: str) -> Optional[dict]:
    """
    카카오 access_token으로 유저 정보 조회.
    반환: {"sub": "...", "email": "...", "name": "..."} 또는 None
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                KAKAO_USER_INFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            _logger.error("[Kakao Auth] API failed: status=%s", resp.status_code)
            return None

        data = resp.json()
        kakao_id = str(data.get("id", ""))
        account = data.get("kakao_account", {})
        profile = account.get("profile", {})

        return {
            "sub": kakao_id,
            "email": account.get("email", ""),
            "name": profile.get("nickname", ""),
        }
    except Exception as e:
        _logger.error("[Kakao Auth] verify failed: %s", e)
        return None


# ───────────────────────────── Apple ───────────────────────────────

APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"
APPLE_CLIENT_ID = os.getenv("APPLE_CLIENT_ID", "com.kknaks.languagediary")

# JWKS 캐시 (프로세스 내 메모리 캐시)
_apple_jwks_cache: Optional[dict] = None


async def _get_apple_public_keys() -> dict:
    """Apple JWKS 엔드포인트에서 공개키 목록을 가져온다 (캐싱)."""
    global _apple_jwks_cache
    if _apple_jwks_cache:
        return _apple_jwks_cache
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(APPLE_JWKS_URL)
        resp.raise_for_status()
        _apple_jwks_cache = resp.json()
    return _apple_jwks_cache


def _build_rsa_public_key(jwk: dict):
    """JWK dict에서 RSA 공개키 객체를 생성한다."""
    def _decode_int(value: str) -> int:
        padded = value + "=" * (4 - len(value) % 4)
        return int.from_bytes(base64.urlsafe_b64decode(padded), "big")

    n = _decode_int(jwk["n"])
    e = _decode_int(jwk["e"])
    pub_numbers = RSAPublicNumbers(e=e, n=n)
    return pub_numbers.public_key(default_backend())


async def verify_apple_token(token: str) -> Optional[dict]:
    """
    Apple id_token JWKS 검증.
    반환: {"sub": "...", "email": "..."} 또는 None
    - Apple 공개키로 서명 검증
    - iss = https://appleid.apple.com
    - aud = com.kknaks.languagediary
    - exp 만료 체크
    """
    try:
        # 1. 헤더에서 kid 추출 (어떤 공개키로 서명됐는지 확인)
        header_part = token.split(".")[0]
        padding = 4 - len(header_part) % 4
        header = json.loads(base64.urlsafe_b64decode(header_part + "=" * padding).decode())
        kid = header.get("kid")
        if not kid:
            return None

        # 2. Apple JWKS에서 해당 kid의 공개키 찾기
        jwks = await _get_apple_public_keys()
        matching_key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
        if not matching_key:
            # 캐시 무효화 후 재시도
            global _apple_jwks_cache
            _apple_jwks_cache = None
            jwks = await _get_apple_public_keys()
            matching_key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
            if not matching_key:
                return None

        # 3. RSA 공개키 생성 후 JWT 검증
        public_key = _build_rsa_public_key(matching_key)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            audience=APPLE_CLIENT_ID,
            issuer=APPLE_ISSUER,
        )

        return {
            "sub": payload.get("sub", ""),
            "email": payload.get("email", ""),
        }

    except (JWTError, Exception):
        return None
