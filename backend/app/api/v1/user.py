from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_onboarded_user
from app.models.user import User
from app.schemas.user import ProfileCreateRequest, UserProfileResponse
from app.services.profile_service import ProfileService

router = APIRouter(prefix="/user", tags=["user"])


@router.post("/profile", status_code=201)
async def create_profile(
    body: ProfileCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService()
    return await service.create_profile(db, current_user.id, body)


@router.get("/profile", response_model=UserProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService()
    return await service.get_profile(db, current_user.id)


# --- Profile partial update ---

class ProfileUpdateRequest(BaseModel):
    nickname: Optional[str] = None
    app_locale: Optional[str] = None
    native_language_id: Optional[int] = None
    target_language_id: Optional[int] = None
    avatar_id: Optional[int] = None
    avatar_name: Optional[str] = None
    voice_id: Optional[int] = None
    pronunciation_voice_id: Optional[int] = None
    empathy: Optional[int] = None
    intuition: Optional[int] = None
    logic: Optional[int] = None
    cefr_level: Optional[str] = None


@router.put("/profile")
async def update_profile(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_onboarded_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService()
    return await service.update_profile(db, current_user.id, body)


# --- Language level ---

class LanguageLevelUpdateRequest(BaseModel):
    language_id: int
    cefr_level: str  # A1~C2


@router.put("/language-level")
async def update_language_level(
    body: LanguageLevelUpdateRequest,
    current_user: User = Depends(get_onboarded_user),
    db: AsyncSession = Depends(get_db),
):
    service = ProfileService()
    return await service.update_language_level(db, current_user.id, body.language_id, body.cefr_level)
