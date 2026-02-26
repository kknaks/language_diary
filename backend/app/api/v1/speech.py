"""Speech endpoints — TTS generation and pronunciation evaluation."""

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import BadRequestError, EvaluationFailedError, NotFoundError, TTSFailedError
from app.models.learning import LearningCard
from app.models.seed import Voice  # noqa: F401
from app.models.user import User
from app.schemas.speech import PronunciationEvaluateResponse, TTSRequest, TTSResponse
from app.services.pronunciation_service import PronunciationError, PronunciationService
from app.services.tts_service import TTSError, TTSService
from app.utils.audio import AudioValidationError

router = APIRouter(prefix="/speech", tags=["speech"])


@router.post("/tts", response_model=TTSResponse)
async def generate_tts(
    request: TTSRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate TTS audio for given text. Returns cached result if available."""
    voice_id = request.voice_id

    # Auto-resolve voice_id from user profile if not specified
    if not voice_id:
        try:
            from app.models.profile import UserProfile
            from sqlalchemy.orm import selectinload
            profile_result = await db.execute(
                select(UserProfile)
                .where(UserProfile.user_id == current_user.id)
                .options(selectinload(UserProfile.voice))
            )
            profile = profile_result.scalar_one_or_none()
            if profile and profile.voice:
                voice_id = profile.voice.elevenlabs_voice_id
        except Exception:
            pass  # Fall through to default

    service = TTSService(db)
    try:
        result = await service.generate(text=request.text, voice_id=voice_id)
    except TTSError as e:
        raise TTSFailedError(detail=str(e))
    return TTSResponse(**result)


@router.post("/evaluate", response_model=PronunciationEvaluateResponse)
async def evaluate_pronunciation(
    card_id: int = Form(...),
    reference_text: str = Form(...),
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Evaluate pronunciation against a reference text for a learning card."""
    # Validate card exists
    stmt = select(LearningCard).where(LearningCard.id == card_id)
    result = await db.execute(stmt)
    card = result.scalar_one_or_none()
    if not card:
        raise NotFoundError(
            code="CARD_NOT_FOUND",
            message="학습 카드를 찾을 수 없습니다.",
            detail="card_id=%d" % card_id,
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
            user_id=current_user.id,
            audio_data=audio_data,
            reference_text=reference_text,
        )
    except AudioValidationError as e:
        raise BadRequestError(
            code="VALIDATION_ERROR",
            message=str(e),
        )
    except PronunciationError as e:
        raise EvaluationFailedError(detail=str(e))

    return PronunciationEvaluateResponse(**evaluation)
