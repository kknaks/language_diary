"""Task schemas — response models for background task polling."""

from typing import Optional

from pydantic import BaseModel


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str  # pending | processing | completed | failed
    progress: int
    total: int
    error: Optional[str] = None

    model_config = {"from_attributes": True}
