from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime


class HomeAvatar(BaseModel):
    id: int
    name: str
    custom_name: Optional[str]
    thumbnail_url: str
    primary_color: str
    model_url: Optional[str] = None

    class Config:
        from_attributes = True


class HomeUser(BaseModel):
    nickname: str
    target_language: Optional[dict]  # {id, code, name_native}


class HomeDiary(BaseModel):
    id: int
    original_text: Optional[str]
    translated_text: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class HomeStats(BaseModel):
    total_diaries: int
    streak_days: int
    today_completed: bool


class HomeResponse(BaseModel):
    user: HomeUser
    avatar: Optional[HomeAvatar]
    recent_diaries: List[HomeDiary]
    stats: HomeStats
