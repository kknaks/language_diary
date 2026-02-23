"""Speech endpoints — TTS generation and pronunciation evaluation."""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.exceptions import AppError, BadRequestError, NotFoundError
from app.models.learning import LearningCard
from app.schemas.speech import PronunciationEvaluateResponse, TTSRequest, TTSResponse
from app.services.pronunciation_service import PronunciationError, PronunciationService
from app.services.tts_service import TTSError, TTSService
from app.utils.audio import AudioValidationError

router = APIRouter(prefix="/speech", tags=["speech"])

MVP_USER_ID = 1


@router.post("/tts", response_model=TTSResponse)
async def generate_tts(
    request: TTSRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate TTS audio for given text. Returns cached result if available."""
    service = TTSService(db)
    try:
        result = await service.generate(text=request.text, voice_id=request.voice_id)
    except TTSError as e:
        raise AppError(
            code="TTS_FAILED",
            message="TTS 생성에 실패했습니다.",
            detail=str(e),
            status_code=502,
        )
    return TTSResponse(**result)


@router.post("/evaluate", response_model=PronunciationEvaluateResponse)
async def evaluate_pronunciation(
    card_id: int = Form(...),
    reference_text: str = Form(...),
    audio: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Evaluate pronunciation against a reference text for a learning card."""
    from sqlalchemy import select

    # Validate card exists
    stmt = select(LearningCard).where(LearningCard.id == card_id)
    result = await db.execute(stmt)
    card = result.scalar_one_or_none()
    if not card:
        raise NotFoundError(
            code="CARD_NOT_FOUND",
            message="학습 카드를 찾을 수 없습니다.",
            detail=f"card_id={card_id}",
        )

    # Read audio data
    audio_data = await audio.read()
    if not audio_data:
        raise BadRequestError(
            code="VALIDATION_ERROR",
            message="오디오 파일이 비어있습니다.",
        )

    service = PronunciationService(db)
    try:
        evaluation = await service.evaluate(
            card_id=card_id,
            user_id=MVP_USER_ID,
            audio_data=audio_data,
            reference_text=reference_text,
        )
    except AudioValidationError as e:
        raise BadRequestError(
            code="VALIDATION_ERROR",
            message=str(e),
        )
    except PronunciationError as e:
        raise AppError(
            code="EVALUATION_FAILED",
            message="발음 평가에 실패했습니다.",
            detail=str(e),
            status_code=502,
        )

    return PronunciationEvaluateResponse(**evaluation)
