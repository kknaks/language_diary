from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.repositories.diary_repo import DiaryRepository
from app.schemas.diary import (
    DiaryDetailResponse,
    DiaryListResponse,
    DiaryResponse,
    DiaryUpdate,
)

MVP_USER_ID = 1


class DiaryService:
    def __init__(self, db: AsyncSession):
        self.repo = DiaryRepository(db)
        self.db = db

    async def get_list(
        self, cursor: Optional[int] = None, limit: int = 20
    ) -> DiaryListResponse:
        limit = min(limit, 50)
        diaries = await self.repo.get_list(MVP_USER_ID, cursor=cursor, limit=limit)

        has_next = len(diaries) > limit
        items = diaries[:limit]

        return DiaryListResponse(
            items=[DiaryResponse.model_validate(d) for d in items],
            next_cursor=items[-1].id if has_next else None,
            has_next=has_next,
        )

    async def get_detail(self, diary_id: int) -> DiaryDetailResponse:
        diary = await self.repo.get_by_id(diary_id, MVP_USER_ID)
        if not diary:
            raise NotFoundError(
                code="DIARY_NOT_FOUND",
                message="일기를 찾을 수 없습니다.",
                detail=f"diary_id={diary_id}",
            )
        return DiaryDetailResponse.model_validate(diary)

    async def update(self, diary_id: int, data: DiaryUpdate) -> DiaryResponse:
        diary = await self.repo.get_by_id(diary_id, MVP_USER_ID)
        if not diary:
            raise NotFoundError(
                code="DIARY_NOT_FOUND",
                message="일기를 찾을 수 없습니다.",
                detail=f"diary_id={diary_id}",
            )

        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            raise BadRequestError(
                code="VALIDATION_ERROR",
                message="수정할 필드가 없습니다.",
                detail="At least one field required",
            )

        diary = await self.repo.update(diary, **update_data)
        await self.db.commit()
        return DiaryResponse.model_validate(diary)

    async def delete(self, diary_id: int) -> None:
        diary = await self.repo.get_by_id(diary_id, MVP_USER_ID)
        if not diary:
            raise NotFoundError(
                code="DIARY_NOT_FOUND",
                message="일기를 찾을 수 없습니다.",
                detail=f"diary_id={diary_id}",
            )
        await self.repo.soft_delete(diary)
        await self.db.commit()

    async def complete(self, diary_id: int) -> DiaryResponse:
        diary = await self.repo.get_by_id(diary_id, MVP_USER_ID)
        if not diary:
            raise NotFoundError(
                code="DIARY_NOT_FOUND",
                message="일기를 찾을 수 없습니다.",
                detail=f"diary_id={diary_id}",
            )
        if diary.status == "completed":
            raise ConflictError(
                code="DIARY_ALREADY_COMPLETED",
                message="이미 학습 완료된 일기입니다.",
                detail=f"diary_id={diary_id}",
            )

        diary = await self.repo.mark_completed(diary)
        await self.db.commit()
        return DiaryResponse.model_validate(diary)
