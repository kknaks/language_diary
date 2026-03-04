from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.seed import CefrLevel


class SeedRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_cefr_level(self, code: str) -> Optional[CefrLevel]:
        return await self.db.get(CefrLevel, code.upper())
