from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class LearningCardResponse(BaseModel):
    id: int
    card_type: str
    content_en: str
    origin_from: Optional[str] = None
    content_ko: str
    part_of_speech: Optional[str] = None
    cefr_level: Optional[str] = None
    example_en: Optional[str] = None
    example_ko: Optional[str] = None
    card_order: int

    model_config = {"from_attributes": True}


class DiaryUpdate(BaseModel):
    original_text: Optional[str] = None
    translated_text: Optional[str] = None


class DiaryResponse(BaseModel):
    id: int
    user_id: int
    title_original: Optional[str] = None
    title_translated: Optional[str] = None
    original_text: str
    translated_text: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DiaryDetailResponse(DiaryResponse):
    learning_cards: List[LearningCardResponse] = []


class DiaryListResponse(BaseModel):
    items: List[DiaryResponse]
    next_cursor: Optional[int] = None
    has_next: bool = False
