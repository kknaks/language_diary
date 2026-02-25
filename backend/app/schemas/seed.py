from typing import List, Optional

from pydantic import BaseModel


class LanguageResponse(BaseModel):
    id: int
    code: str
    name_native: str
    is_active: bool

    model_config = {"from_attributes": True}


class AvatarResponse(BaseModel):
    id: int
    name: str
    thumbnail_url: str
    primary_color: str
    is_active: bool

    model_config = {"from_attributes": True}


class VoiceResponse(BaseModel):
    id: int
    language_id: int
    name: str
    gender: str
    tone: Optional[str] = None
    sample_url: Optional[str] = None
    description: Optional[str] = None
    is_active: bool

    model_config = {"from_attributes": True}


class LanguageListResponse(BaseModel):
    items: List[LanguageResponse]


class AvatarListResponse(BaseModel):
    items: List[AvatarResponse]


class VoiceListResponse(BaseModel):
    items: List[VoiceResponse]
