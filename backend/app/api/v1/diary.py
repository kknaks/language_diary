from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.diary import (
    DiaryDetailResponse,
    DiaryListResponse,
    DiaryResponse,
    DiaryUpdate,
)
from app.services.diary_service import DiaryService

router = APIRouter(prefix="/diary", tags=["diary"])


def _service(db: AsyncSession = Depends(get_db)) -> DiaryService:
    return DiaryService(db)


@router.get("", response_model=DiaryListResponse)
async def list_diaries(
    cursor: Optional[int] = Query(None, description="Cursor (diary id) for pagination"),
    limit: int = Query(20, ge=1, le=50),
    service: DiaryService = Depends(_service),
):
    return await service.get_list(cursor=cursor, limit=limit)


@router.get("/{diary_id}", response_model=DiaryDetailResponse)
async def get_diary(diary_id: int, service: DiaryService = Depends(_service)):
    return await service.get_detail(diary_id)


@router.put("/{diary_id}", response_model=DiaryResponse)
async def update_diary(
    diary_id: int,
    data: DiaryUpdate,
    service: DiaryService = Depends(_service),
):
    return await service.update(diary_id, data)


@router.delete("/{diary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary(diary_id: int, service: DiaryService = Depends(_service)):
    await service.delete(diary_id)


@router.post("/{diary_id}/complete", response_model=DiaryResponse)
async def complete_diary(diary_id: int, service: DiaryService = Depends(_service)):
    return await service.complete(diary_id)
