"""Tests for AI service circuit breaker integration."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.ai_service import AIService, AIServiceError, _openai_cb


@pytest.fixture(autouse=True)
def reset_circuit_breaker():
    _openai_cb.reset()
    yield
    _openai_cb.reset()


def _make_mock_openai_client(content: str):
    mock_client = AsyncMock()
    mock_choice = MagicMock()
    mock_choice.message.content = content
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_ai_service_retries_on_failure():
    """AI service retries failed OpenAI calls."""
    mock_client = AsyncMock()
    mock_choice = MagicMock()
    mock_choice.message.content = "오늘 뭐 했어?"
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    # Fail first, succeed second
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[Exception("timeout"), mock_response]
    )

    service = AIService(client=mock_client)
    result = await service.get_first_message()
    assert result == "오늘 뭐 했어?"
    assert mock_client.chat.completions.create.call_count == 2


@pytest.mark.asyncio
async def test_ai_service_raises_after_max_retries():
    """AI service raises AIServiceError after all retries exhausted."""
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=Exception("persistent failure")
    )

    service = AIService(client=mock_client)
    with pytest.raises(AIServiceError, match="OpenAI API 호출 실패"):
        await service.get_first_message()


@pytest.mark.asyncio
async def test_ai_service_circuit_breaker_opens():
    """Circuit breaker opens after too many failures."""
    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=Exception("fail")
    )

    service = AIService(client=mock_client)

    # Exhaust retries multiple times to trigger circuit breaker
    for _ in range(2):
        try:
            await service.get_first_message()
        except AIServiceError:
            pass

    # Circuit should be open now — next call should fail immediately
    with pytest.raises(AIServiceError, match="일시적으로 사용할 수 없습니다"):
        await service.get_first_message()


@pytest.mark.asyncio
async def test_ai_service_success_resets_circuit_breaker():
    """Successful call resets the circuit breaker."""
    mock_client = _make_mock_openai_client("안녕!")
    service = AIService(client=mock_client)

    # Record some failures
    _openai_cb.record_failure()
    _openai_cb.record_failure()

    # Successful call should reset
    result = await service.get_first_message()
    assert result == "안녕!"
    assert _openai_cb._failure_count == 0
