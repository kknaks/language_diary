from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.diary import Diary


class DiaryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_list(
        self, user_id: int, cursor: Optional[int] = None, limit: int = 20
    ) -> List[Diary]:
        stmt = (
            select(Diary)
            .where(Diary.user_id == user_id, Diary.deleted_at.is_(None))
            .order_by(Diary.id.desc())
            .limit(limit + 1)
        )
        if cursor is not None:
            stmt = stmt.where(Diary.id < cursor)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, diary_id: int, user_id: int) -> Optional[Diary]:
        stmt = (
            select(Diary)
            .options(selectinload(Diary.learning_cards))
            .where(Diary.id == diary_id, Diary.user_id == user_id, Diary.deleted_at.is_(None))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update(self, diary: Diary, **kwargs) -> Diary:
        for key, value in kwargs.items():
            setattr(diary, key, value)
        diary.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(diary)
        return diary

    async def soft_delete(self, diary: Diary) -> Diary:
        diary.deleted_at = datetime.utcnow()
        diary.updated_at = datetime.utcnow()
        await self.db.flush()
        return diary

    async def mark_completed(self, diary: Diary) -> Diary:
        now = datetime.utcnow()
        diary.status = "completed"
        diary.completed_at = now
        diary.updated_at = now
        await self.db.flush()
        await self.db.refresh(diary)
        return diary
