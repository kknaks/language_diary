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
