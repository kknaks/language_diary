from typing import Optional
from datetime import datetime

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: int
    nickname: str
    native_lang: str
    target_lang: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LanguageInfo(BaseModel):
    id: int
    code: str
    name_native: str

    class Config:
        from_attributes = True


class AvatarInfo(BaseModel):
    id: int
    name: str
    thumbnail_url: str
    primary_color: str
    model_url: Optional[str] = None

    class Config:
        from_attributes = True


class VoiceInfo(BaseModel):
    id: int
    name: str
    gender: str
    tone: Optional[str]
    sample_url: Optional[str]
    description: Optional[str]

    class Config:
        from_attributes = True


class LanguageLevelInfo(BaseModel):
    language_id: int
    cefr_level: str

    class Config:
        from_attributes = True


class ProfileResponse(BaseModel):
    id: int
    user_id: int
    app_locale: str
    native_language: Optional[LanguageInfo]
    target_language: Optional[LanguageInfo]
    avatar: Optional[AvatarInfo]
    avatar_name: Optional[str]
    voice: Optional[VoiceInfo]
    pronunciation_voice_id: Optional[int] = None
    pronunciation_voice: Optional[VoiceInfo] = None
    empathy: int
    intuition: int
    logic: int
    onboarding_completed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserProfileResponse(BaseModel):
    id: int
    email: Optional[str]
    nickname: str
    social_provider: Optional[str]
    is_active: bool
    created_at: datetime
    profile: Optional[ProfileResponse]
    language_level: Optional[LanguageLevelInfo]

    class Config:
        from_attributes = True


class ProfileCreateRequest(BaseModel):
    native_language_id: int
    target_language_id: int
    avatar_id: Optional[int] = None
    avatar_name: Optional[str] = None
    voice_id: Optional[int] = None
    pronunciation_voice_id: Optional[int] = None
    empathy: int = 50
    intuition: int = 50
    logic: int = 50
    app_locale: str = "ko"
    cefr_level: Optional[str] = None
