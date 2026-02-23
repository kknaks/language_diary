"""Structured error handling per PRD 10.3 / 10.4.

Error codes:
    VALIDATION_ERROR    400  — Request data validation failure
    UNAUTHORIZED        401  — Auth failure / token expired (Phase 2)
    DIARY_NOT_FOUND     404  — Diary not found
    SESSION_NOT_FOUND   404  — Conversation session not found
    SESSION_EXPIRED     410  — Conversation session expired
    SESSION_ALREADY_COMPLETED 409 — Session already completed
    TRANSLATION_FAILED  502  — OpenAI translation failure
    STT_FAILED          502  — Speech-to-text failure
    TTS_FAILED          502  — TTS generation failure
    EVALUATION_FAILED   502  — Pronunciation evaluation failure
    RATE_LIMITED        429  — Request rate limit exceeded
"""

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base application error with structured response per PRD 10.3."""

    def __init__(self, code: str, message: str, detail: str = "", status_code: int = 400):
        self.code = code
        self.message = message
        self.detail = detail
        self.status_code = status_code


class NotFoundError(AppError):
    def __init__(self, code: str = "DIARY_NOT_FOUND", message: str = "리소스를 찾을 수 없습니다.", detail: str = ""):
        super().__init__(code=code, message=message, detail=detail, status_code=status.HTTP_404_NOT_FOUND)


class BadRequestError(AppError):
    def __init__(self, code: str = "VALIDATION_ERROR", message: str = "요청 데이터가 올바르지 않습니다.", detail: str = ""):
        super().__init__(code=code, message=message, detail=detail, status_code=status.HTTP_400_BAD_REQUEST)


class ConflictError(AppError):
    def __init__(self, code: str = "CONFLICT", message: str = "충돌이 발생했습니다.", detail: str = ""):
        super().__init__(code=code, message=message, detail=detail, status_code=status.HTTP_409_CONFLICT)


class SessionExpiredError(AppError):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="SESSION_EXPIRED",
            message="대화 세션이 만료되었습니다.",
            detail=detail,
            status_code=status.HTTP_410_GONE,
        )


class SessionAlreadyCompletedError(ConflictError):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="SESSION_ALREADY_COMPLETED",
            message="이미 완료된 대화 세션입니다.",
            detail=detail,
        )


class ExternalServiceError(AppError):
    """502 error for external API failures (OpenAI, ElevenLabs, Azure)."""

    def __init__(self, code: str, message: str, detail: str = ""):
        super().__init__(code=code, message=message, detail=detail, status_code=status.HTTP_502_BAD_GATEWAY)


class TranslationFailedError(ExternalServiceError):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="TRANSLATION_FAILED",
            message="번역/일기 생성에 실패했습니다.",
            detail=detail,
        )


class STTFailedError(ExternalServiceError):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="STT_FAILED",
            message="음성 인식에 실패했습니다.",
            detail=detail,
        )


class TTSFailedError(ExternalServiceError):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="TTS_FAILED",
            message="TTS 생성에 실패했습니다.",
            detail=detail,
        )


class EvaluationFailedError(ExternalServiceError):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="EVALUATION_FAILED",
            message="발음 평가에 실패했습니다.",
            detail=detail,
        )


class RateLimitedError(AppError):
    def __init__(self, detail: str = ""):
        super().__init__(
            code="RATE_LIMITED",
            message="요청 한도를 초과했습니다.",
            detail=detail,
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        )


# --- Exception Handlers ---

async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "detail": exc.detail,
            }
        },
    )


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "요청 데이터 검증 실패",
                "detail": str(exc.errors()),
            }
        },
    )


async def generic_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions — returns 500."""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "서버 내부 오류가 발생했습니다.",
                "detail": "",
            }
        },
    )
