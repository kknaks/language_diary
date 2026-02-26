"""Unit tests for ConversationService with mocked AIService."""

import pytest
from unittest.mock import AsyncMock

from app.services.conversation_service import ConversationService


@pytest.mark.asyncio
async def test_create_session(db_session, seed_user):
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 하루 어땠어?")

    service = ConversationService(db_session, ai_service=mock_ai)
    result = await service.create_session(user_id=1)

    assert result.session_id.startswith("conv_")
    assert result.status == "created"
    assert result.first_message == "오늘 하루 어땠어?"
    mock_ai.get_first_message.assert_called_once()


@pytest.mark.asyncio
async def test_get_session(db_session, seed_conversation):
    service = ConversationService(db_session)
    result = await service.get_session("conv_test123")

    assert result.session_id == "conv_test123"
    assert result.status == "active"
    assert len(result.messages) == 1


@pytest.mark.asyncio
async def test_get_session_not_found(db_session, seed_user):
    service = ConversationService(db_session)
    with pytest.raises(Exception) as exc_info:
        await service.get_session("conv_nope")
    assert "SESSION_NOT_FOUND" in str(exc_info.value.code)


@pytest.mark.asyncio
async def test_handle_user_message(db_session, seed_conversation):
    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="어떤 회의였어?")

    service = ConversationService(db_session, ai_service=mock_ai)
    reply = await service.handle_user_message("conv_test123", "회의했어")

    assert reply == "어떤 회의였어?"

    # Verify turn count and messages
    detail = await service.get_session("conv_test123")
    assert detail.turn_count == 1
    assert len(detail.messages) == 3  # AI first + user + AI reply


@pytest.mark.asyncio
async def test_handle_user_message_completed_session(db_session, seed_conversation):
    from datetime import datetime
    seed_conversation.status = "completed"
    seed_conversation.completed_at = datetime.utcnow()
    await db_session.commit()

    service = ConversationService(db_session)
    with pytest.raises(Exception) as exc_info:
        await service.handle_user_message("conv_test123", "hello")
    assert "SESSION_ALREADY_COMPLETED" in str(exc_info.value.code)


@pytest.mark.asyncio
async def test_handle_user_message_expired_session(db_session, seed_conversation):
    from datetime import datetime
    seed_conversation.status = "expired"
    seed_conversation.expired_at = datetime.utcnow()
    await db_session.commit()

    service = ConversationService(db_session)
    with pytest.raises(Exception) as exc_info:
        await service.handle_user_message("conv_test123", "hello")
    assert "SESSION_EXPIRED" in str(exc_info.value.code)


@pytest.mark.asyncio
async def test_finish_conversation(db_session, seed_conversation):
    mock_ai = AsyncMock()
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "오늘 회의를 했다.",
        "translated_text": "I had a meeting today.",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[
        {
            "card_type": "word",
            "content_en": "meeting",
            "content_ko": "회의",
            "part_of_speech": "noun",
            "cefr_level": "A2",
            "example_en": "I had a meeting.",
            "example_ko": "회의를 했다.",
        }
    ])

    service = ConversationService(db_session, ai_service=mock_ai)
    result = await service.finish_conversation("conv_test123")

    assert result.original_text == "오늘 회의를 했다."
    assert result.translated_text == "I had a meeting today."
    assert result.status == "translated"
    assert len(result.learning_cards) == 1
    assert result.learning_cards[0].content_en == "meeting"

    # Session should be completed
    detail = await service.get_session("conv_test123")
    assert detail.status == "completed"
    assert detail.diary_id == result.id


@pytest.mark.asyncio
async def test_finish_completed_session(db_session, seed_conversation):
    from datetime import datetime
    seed_conversation.status = "completed"
    seed_conversation.completed_at = datetime.utcnow()
    await db_session.commit()

    service = ConversationService(db_session)
    with pytest.raises(Exception) as exc_info:
        await service.finish_conversation("conv_test123")
    assert "SESSION_ALREADY_COMPLETED" in str(exc_info.value.code)


@pytest.mark.asyncio
async def test_max_turns_returns_none(db_session, seed_conversation):
    """When max turns reached, handle_user_message returns None to signal auto-finish."""
    # Set turn count to 9 (one below max of 10)
    seed_conversation.turn_count = 9
    await db_session.commit()

    mock_ai = AsyncMock()
    service = ConversationService(db_session, ai_service=mock_ai)

    result = await service.handle_user_message("conv_test123", "마지막 메시지")
    assert result is None  # Signals auto-finish


@pytest.mark.asyncio
async def test_create_session_ws(db_session, seed_user):
    """create_session_ws creates session without AI message."""
    mock_ai = AsyncMock()
    service = ConversationService(db_session, ai_service=mock_ai)

    session_id = await service.create_session_ws(user_id=1)
    assert session_id.startswith("conv_")

    # Should not call AI
    mock_ai.get_first_message.assert_not_called()

    # Session should exist but have no messages
    detail = await service.get_session(session_id)
    assert detail.status == "created"
    assert len(detail.messages) == 0


@pytest.mark.asyncio
async def test_generate_greeting(db_session, seed_user):
    """generate_greeting creates AI greeting and saves to DB."""
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="안녕! 오늘 어땠어?")

    service = ConversationService(db_session, ai_service=mock_ai)
    session_id = await service.create_session_ws()

    greeting = await service.generate_greeting(session_id)
    assert greeting == "안녕! 오늘 어땠어?"
    mock_ai.get_first_message.assert_called_once()

    # Should have 1 message in session
    detail = await service.get_session(session_id)
    assert len(detail.messages) == 1
    assert detail.messages[0].content == "안녕! 오늘 어땠어?"


@pytest.mark.asyncio
async def test_handle_user_message_streaming(db_session, seed_conversation):
    """handle_user_message_streaming yields sentences from AI."""
    async def mock_streaming(history, **kwargs):
        yield "어떤 회의였어?"
        yield "재미있었어?"

    mock_ai = AsyncMock()
    mock_ai.get_reply_streaming = mock_streaming

    service = ConversationService(db_session, ai_service=mock_ai)
    sentences = []
    async for sentence in service.handle_user_message_streaming("conv_test123", "회의했어"):
        sentences.append(sentence)

    assert sentences == ["어떤 회의였어?", "재미있었어?"]

    # Verify messages saved
    detail = await service.get_session("conv_test123")
    # original AI msg + user msg + AI reply
    assert len(detail.messages) == 3
