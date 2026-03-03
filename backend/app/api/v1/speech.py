"""Speech endpoints — TTS generation and pronunciation evaluation."""

from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import BadRequestError, EvaluationFailedError, NotFoundError, TTSFailedError
from app.models.learning import LearningCard, PronunciationResult
from app.models.seed import Voice  # noqa: F401
from app.models.user import User
from app.repositories.pronunciation_repo import PronunciationRepository
from app.schemas.speech import (
    PronunciationEvaluateResponse,
    PronunciationResultsResponse,
    PronunciationSaveRequest,
    SpeechTokenResponse,
    TTSRequest,
    TTSResponse,
    WordScore,
)
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


@router.post("/token", response_model=SpeechTokenResponse)
async def get_speech_token(
    current_user: User = Depends(get_current_user),
):
    """Issue a short-lived Azure Speech token for client-side SDK usage."""
    region = settings.AZURE_SPEECH_REGION
    endpoint = settings.AZURE_SPEECH_ENDPOINT
    key = settings.AZURE_SPEECH_KEY
    if not key:
        raise BadRequestError(
            code="VALIDATION_ERROR",
            message="Azure Speech 키가 설정되지 않았습니다.",
        )

    # AI Services 리소스: 커스텀 엔드포인트 사용, 없으면 region 기반 fallback
    if endpoint:
        token_url = f"{endpoint.rstrip('/')}/sts/v1.0/issueToken"
    else:
        token_url = f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                token_url,
                headers={"Ocp-Apim-Subscription-Key": key},
                timeout=10.0,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise EvaluationFailedError(detail=f"Azure 토큰 발급 실패: {e}")

    return SpeechTokenResponse(
        token=resp.text,
        region=region,
        endpoint=endpoint or None,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )


@router.post("/result", response_model=PronunciationEvaluateResponse)
async def save_pronunciation_result(
    request: PronunciationSaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save pronunciation result evaluated by the client-side Azure Speech SDK."""
    # Validate card exists
    stmt = select(LearningCard).where(LearningCard.id == request.card_id)
    result = await db.execute(stmt)
    card = result.scalar_one_or_none()
    if not card:
        raise NotFoundError(
            code="CARD_NOT_FOUND",
            message="학습 카드를 찾을 수 없습니다.",
            detail="card_id=%d" % request.card_id,
        )

    repo = PronunciationRepository(db)
    attempt_number = await repo.get_next_attempt_number(request.card_id, current_user.id)

    feedback = request.feedback
    if not feedback:
        score = request.overall_score
        if score >= 80:
            feedback = "훌륭한 발음입니다! 계속 연습하세요."
        elif score >= 60:
            feedback = "괜찮은 발음이에요. 조금 더 연습하면 좋아질 거예요."
        else:
            feedback = "발음을 좀 더 연습해 보세요. 원어민 음성을 듣고 따라해 보세요."

    pron_result = await repo.create(
        card_id=request.card_id,
        user_id=current_user.id,
        attempt_number=attempt_number,
        reference_text=request.reference_text,
        accuracy_score=request.accuracy_score,
        fluency_score=request.fluency_score,
        completeness_score=request.completeness_score,
        overall_score=request.overall_score,
        feedback=feedback,
        word_scores=[ws.model_dump() for ws in request.word_scores] if request.word_scores else None,
    )
    await db.commit()

    return PronunciationEvaluateResponse(
        id=pron_result.id,
        card_id=pron_result.card_id,
        overall_score=float(pron_result.overall_score or 0),
        accuracy_score=float(pron_result.accuracy_score or 0),
        fluency_score=float(pron_result.fluency_score or 0),
        completeness_score=float(pron_result.completeness_score or 0),
        feedback=pron_result.feedback,
        reference_text=pron_result.reference_text,
        word_scores=request.word_scores,
        attempt_number=pron_result.attempt_number,
        created_at=pron_result.created_at,
    )


def _to_response(r: "PronunciationResult") -> PronunciationEvaluateResponse:
    ws = r.word_scores or []
    return PronunciationEvaluateResponse(
        id=r.id,
        card_id=r.card_id,
        overall_score=float(r.overall_score or 0),
        accuracy_score=float(r.accuracy_score or 0),
        fluency_score=float(r.fluency_score or 0),
        completeness_score=float(r.completeness_score or 0),
        feedback=r.feedback,
        reference_text=r.reference_text,
        word_scores=[WordScore(**w) for w in ws],
        attempt_number=r.attempt_number,
        created_at=r.created_at,
    )


@router.get("/results", response_model=PronunciationResultsResponse)
async def get_pronunciation_results(
    card_ids: str = Query(..., description="Comma-separated card IDs"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get latest pronunciation results for given card IDs."""
    ids = [int(x.strip()) for x in card_ids.split(",") if x.strip().isdigit()]
    if not ids:
        return PronunciationResultsResponse(results={})

    repo = PronunciationRepository(db)
    latest = await repo.get_latest_by_card_ids(ids, current_user.id)

    results = {cid: _to_response(latest[cid]) if cid in latest else None for cid in ids}
    return PronunciationResultsResponse(results=results)
