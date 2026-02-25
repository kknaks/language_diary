from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_onboarded_user
from app.models.user import User
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
    current_user: User = Depends(get_onboarded_user),
    service: DiaryService = Depends(_service),
):
    return await service.get_list(user_id=current_user.id, cursor=cursor, limit=limit)


@router.get("/{diary_id}", response_model=DiaryDetailResponse)
async def get_diary(
    diary_id: int,
    current_user: User = Depends(get_onboarded_user),
    service: DiaryService = Depends(_service),
):
    return await service.get_detail(diary_id, user_id=current_user.id)


@router.put("/{diary_id}", response_model=DiaryResponse)
async def update_diary(
    diary_id: int,
    data: DiaryUpdate,
    current_user: User = Depends(get_onboarded_user),
    service: DiaryService = Depends(_service),
):
    return await service.update(diary_id, data, user_id=current_user.id)


@router.delete("/{diary_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary(
    diary_id: int,
    current_user: User = Depends(get_onboarded_user),
    service: DiaryService = Depends(_service),
):
    await service.delete(diary_id, user_id=current_user.id)


@router.post("/{diary_id}/complete", response_model=DiaryResponse)
async def complete_diary(
    diary_id: int,
    current_user: User = Depends(get_onboarded_user),
    service: DiaryService = Depends(_service),
):
    return await service.complete(diary_id, user_id=current_user.id)
