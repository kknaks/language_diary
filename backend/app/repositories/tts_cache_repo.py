"""Repository for TTS cache database operations."""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tts_cache import TTSCache


class TTSCacheRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_hash(self, text_hash: str) -> Optional[TTSCache]:
        stmt = select(TTSCache).where(TTSCache.text_hash == text_hash)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        text_hash: str,
        text: str,
        audio_url: str,
        voice_id: Optional[str] = None,
        duration_ms: Optional[int] = None,
    ) -> TTSCache:
        cache = TTSCache(
            text_hash=text_hash,
            text=text,
            audio_url=audio_url,
            voice_id=voice_id,
            duration_ms=duration_ms,
        )
        self.db.add(cache)
        await self.db.flush()
        await self.db.refresh(cache)
        return cache
