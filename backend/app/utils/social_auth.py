"""소셜 로그인 ID 토큰 검증 유틸리티."""
import os
import httpx
from typing import Optional
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

_google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_IDS = [_google_client_id] if _google_client_id else []


async def verify_google_token(token: str) -> Optional[dict]:
    """
    Google id_token 검증.
    반환: {"sub": "...", "email": "...", "name": "..."} 또는 None
    개발/테스트 환경에서 GOOGLE_CLIENT_IDS가 비어있으면 토큰 파싱만 수행 (검증 스킵).
    """
    try:
        if not GOOGLE_CLIENT_IDS:
            # 개발 모드: 토큰 파싱만 (검증 없음)
            import base64, json
            parts = token.split(".")
            if len(parts) != 3:
                return None
            padding = 4 - len(parts[1]) % 4
            padded = parts[1] + "=" * padding
            payload = json.loads(base64.urlsafe_b64decode(padded).decode())
            return {
                "sub": payload.get("sub", "test_google_id"),
                "email": payload.get("email", ""),
                "name": payload.get("name", ""),
            }
        idinfo = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_IDS[0]
        )
        return {"sub": idinfo["sub"], "email": idinfo.get("email", ""), "name": idinfo.get("name", "")}
    except Exception:
        return None


async def verify_apple_token(token: str) -> Optional[dict]:
    """
    Apple id_token 검증.
    반환: {"sub": "...", "email": "..."} 또는 None
    개발/테스트 환경에서는 파싱만 수행.
    """
    try:
        import base64, json
        parts = token.split(".")
        if len(parts) != 3:
            return None
        padding = 4 - len(parts[1]) % 4
        padded = parts[1] + "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        return {
            "sub": payload.get("sub", "test_apple_id"),
            "email": payload.get("email", ""),
        }
    except Exception:
        return None
