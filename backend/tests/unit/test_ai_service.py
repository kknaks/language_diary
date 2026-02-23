"""Unit tests for AIService with mocked OpenAI client."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.ai_service import AIService


def _make_mock_openai(content: str):
    """Create a mock OpenAI client that returns the given content."""
    mock_client = AsyncMock()
    mock_choice = MagicMock()
    mock_choice.message.content = content

    mock_response = MagicMock()
    mock_response.choices = [mock_choice]

    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_get_first_message():
    mock_client = _make_mock_openai("오늘 하루 어땠어?")
    service = AIService(client=mock_client)

    result = await service.get_first_message()
    assert result == "오늘 하루 어땠어?"
    mock_client.chat.completions.create.assert_called_once()


@pytest.mark.asyncio
async def test_get_reply():
    mock_client = _make_mock_openai("어떤 회의였어? 누구랑?")
    service = AIService(client=mock_client)

    history = [
        {"role": "assistant", "content": "오늘 하루 어땠어?"},
        {"role": "user", "content": "회사에서 회의했어"},
    ]
    result = await service.get_reply(history)
    assert result == "어떤 회의였어? 누구랑?"


@pytest.mark.asyncio
async def test_generate_diary():
    diary_json = '{"original_text": "오늘 회의를 했다.", "translated_text": "I had a meeting today."}'
    mock_client = _make_mock_openai(diary_json)
    service = AIService(client=mock_client)

    history = [
        {"role": "assistant", "content": "오늘 하루 어땠어?"},
        {"role": "user", "content": "회의했어"},
    ]
    result = await service.generate_diary(history)
    assert result["original_text"] == "오늘 회의를 했다."
    assert result["translated_text"] == "I had a meeting today."


@pytest.mark.asyncio
async def test_generate_diary_with_markdown_code_block():
    """AI sometimes wraps JSON in markdown code blocks."""
    diary_json = '```json\n{"original_text": "일기", "translated_text": "diary"}\n```'
    mock_client = _make_mock_openai(diary_json)
    service = AIService(client=mock_client)

    result = await service.generate_diary([])
    assert result["original_text"] == "일기"
    assert result["translated_text"] == "diary"


@pytest.mark.asyncio
async def test_generate_diary_invalid_json():
    """Returns default when AI returns invalid JSON."""
    mock_client = _make_mock_openai("This is not JSON")
    service = AIService(client=mock_client)

    result = await service.generate_diary([])
    assert result == {"original_text": "", "translated_text": ""}


@pytest.mark.asyncio
async def test_extract_learning_points():
    lp_json = '''[
        {
            "card_type": "word",
            "content_en": "meeting",
            "content_ko": "회의",
            "part_of_speech": "noun",
            "cefr_level": "A2",
            "example_en": "I had a meeting.",
            "example_ko": "회의를 했다."
        },
        {
            "card_type": "phrase",
            "content_en": "team leader",
            "content_ko": "팀장",
            "part_of_speech": null,
            "cefr_level": "B1",
            "example_en": "I met my team leader.",
            "example_ko": "팀장을 만났다."
        }
    ]'''
    mock_client = _make_mock_openai(lp_json)
    service = AIService(client=mock_client)

    result = await service.extract_learning_points("I had a meeting with my team leader.")
    assert len(result) == 2
    assert result[0]["card_type"] == "word"
    assert result[0]["content_en"] == "meeting"
    assert result[1]["card_type"] == "phrase"
    assert result[1]["cefr_level"] == "B1"


@pytest.mark.asyncio
async def test_extract_learning_points_invalid_json():
    """Returns empty list when AI returns invalid JSON."""
    mock_client = _make_mock_openai("broken json")
    service = AIService(client=mock_client)

    result = await service.extract_learning_points("some text")
    assert result == []
