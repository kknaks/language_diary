from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.seed import Avatar, Language, Voice
from app.models.user import User
from app.schemas.seed import (
    AvatarListResponse,
    AvatarResponse,
    LanguageListResponse,
    LanguageResponse,
    VoiceListResponse,
    VoiceResponse,
)

router = APIRouter(tags=["seed"])


@router.get("/languages", response_model=LanguageListResponse)
async def list_languages(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = select(Language)
    if active_only:
        stmt = stmt.where(Language.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    items = [LanguageResponse.model_validate(r) for r in result.scalars().all()]
    return LanguageListResponse(items=items)


@router.get("/avatars", response_model=AvatarListResponse)
async def list_avatars(
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = select(Avatar)
    if active_only:
        stmt = stmt.where(Avatar.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    items = [AvatarResponse.model_validate(r) for r in result.scalars().all()]
    return AvatarListResponse(items=items)


@router.get("/voices", response_model=VoiceListResponse)
async def list_voices(
    language_id: Optional[int] = Query(None),
    active_only: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    stmt = select(Voice)
    if active_only:
        stmt = stmt.where(Voice.is_active == True)  # noqa: E712
    if language_id is not None:
        stmt = stmt.where(Voice.language_id == language_id)
    result = await db.execute(stmt)
    items = [VoiceResponse.model_validate(r) for r in result.scalars().all()]
    return VoiceListResponse(items=items)
