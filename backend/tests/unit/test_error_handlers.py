"""Tests for consolidated error handlers and exception classes."""

import pytest

from app.exceptions import (
    AppError,
    BadRequestError,
    ConflictError,
    EvaluationFailedError,
    ExternalServiceError,
    NotFoundError,
    RateLimitedError,
    STTFailedError,
    SessionAlreadyCompletedError,
    SessionExpiredError,
    TTSFailedError,
    TranslationFailedError,
)


class TestExceptionClasses:
    def test_app_error_defaults(self):
        e = AppError(code="TEST", message="test message")
        assert e.code == "TEST"
        assert e.message == "test message"
        assert e.detail == ""
        assert e.status_code == 400

    def test_not_found_error(self):
        e = NotFoundError(code="DIARY_NOT_FOUND", detail="diary_id=1")
        assert e.status_code == 404
        assert e.code == "DIARY_NOT_FOUND"

    def test_bad_request_error(self):
        e = BadRequestError()
        assert e.status_code == 400
        assert e.code == "VALIDATION_ERROR"

    def test_conflict_error(self):
        e = ConflictError()
        assert e.status_code == 409

    def test_session_expired_error(self):
        e = SessionExpiredError(detail="session_id=conv_123")
        assert e.status_code == 410
        assert e.code == "SESSION_EXPIRED"

    def test_session_already_completed_error(self):
        e = SessionAlreadyCompletedError()
        assert e.status_code == 409
        assert e.code == "SESSION_ALREADY_COMPLETED"

    def test_translation_failed_error(self):
        e = TranslationFailedError(detail="OpenAI down")
        assert e.status_code == 502
        assert e.code == "TRANSLATION_FAILED"

    def test_stt_failed_error(self):
        e = STTFailedError()
        assert e.status_code == 502
        assert e.code == "STT_FAILED"

    def test_tts_failed_error(self):
        e = TTSFailedError()
        assert e.status_code == 502
        assert e.code == "TTS_FAILED"

    def test_evaluation_failed_error(self):
        e = EvaluationFailedError()
        assert e.status_code == 502
        assert e.code == "EVALUATION_FAILED"

    def test_rate_limited_error(self):
        e = RateLimitedError()
        assert e.status_code == 429
        assert e.code == "RATE_LIMITED"

    def test_external_service_error_base(self):
        e = ExternalServiceError(code="TEST_502", message="External down")
        assert e.status_code == 502


class TestErrorHandlers:
    """Test the exception handlers produce the correct JSON responses."""

    @pytest.mark.asyncio
    async def test_app_error_handler(self, client, seed_user):
        """A 404 from the diary endpoint returns PRD 10.3 error format."""
        resp = await client.get("/api/v1/diary/999")
        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data
        assert data["error"]["code"] == "DIARY_NOT_FOUND"
        assert "message" in data["error"]
        assert "detail" in data["error"]

    @pytest.mark.asyncio
    async def test_validation_error_handler(self, client, seed_user):
        """Invalid request body returns VALIDATION_ERROR."""
        resp = await client.post(
            "/api/v1/speech/tts",
            json={},  # missing required 'text' field
        )
        assert resp.status_code == 422
        data = resp.json()
        assert data["error"]["code"] == "VALIDATION_ERROR"

    @pytest.mark.asyncio
    async def test_session_not_found_error(self, client, seed_user):
        """Missing session returns SESSION_NOT_FOUND."""
        resp = await client.get("/api/v1/conversation/conv_nonexistent")
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "SESSION_NOT_FOUND"
