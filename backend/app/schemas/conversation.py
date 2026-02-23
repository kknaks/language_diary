from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.diary import DiaryDetailResponse


class ConversationMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    message_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationCreateResponse(BaseModel):
    session_id: str
    status: str
    first_message: str
    created_at: datetime


class ConversationDetailResponse(BaseModel):
    session_id: str
    status: str
    turn_count: int
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    expired_at: Optional[datetime] = None
    diary_id: Optional[int] = None
    messages: List[ConversationMessageResponse] = []


# WebSocket message types (server → client)
class WSAIMessage(BaseModel):
    type: str = "ai_message"
    text: str


class WSDiaryCreated(BaseModel):
    type: str = "diary_created"
    diary: DiaryDetailResponse


class WSError(BaseModel):
    type: str = "error"
    code: str
    message: str
