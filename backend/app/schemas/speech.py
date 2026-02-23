"""Schemas for TTS and pronunciation evaluation endpoints."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# --- TTS ---

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000, description="Text to synthesize")
    voice_id: Optional[str] = Field(None, description="ElevenLabs voice ID (optional)")


class TTSResponse(BaseModel):
    audio_url: str
    text: str
    cached: bool = False
    duration_ms: Optional[int] = None


# --- Pronunciation Evaluation ---

class WordScore(BaseModel):
    word: str
    score: float
    error_type: Optional[str] = None


class PronunciationEvaluateResponse(BaseModel):
    id: int
    card_id: int
    overall_score: float
    accuracy_score: float
    fluency_score: float
    completeness_score: float
    feedback: Optional[str] = None
    word_scores: List[WordScore] = []
    attempt_number: int
    created_at: datetime

    model_config = {"from_attributes": True}
