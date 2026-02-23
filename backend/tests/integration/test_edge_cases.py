"""Edge case tests — boundary conditions, invalid input, max turns, expired sessions, concurrent requests."""

import struct
import pytest
from unittest.mock import AsyncMock, patch
from datetime import datetime

from starlette.testclient import TestClient

from app.main import app
from app.models.conversation import ConversationSession, ConversationMessage


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_wav(sample_rate=16000, bits_per_sample=16, num_channels=1, data_size=3200):
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    chunk_size = 36 + data_size
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", chunk_size, b"WAVE", b"fmt ", 16,
        1, num_channels, sample_rate, byte_rate, block_align, bits_per_sample,
        b"data", data_size,
    )
    return header + (b"\x00" * data_size)


# ---------------------------------------------------------------------------
# Max turns (10 turns → auto-finish)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_max_turns_auto_finish(client, seed_user):
    """After MAX_TURNS user messages, conversation auto-finishes and produces diary.

    turn_count starts at 0. After increment, condition is `turn_count + 1 >= 10`.
    So after 9th message (turn_count=9), 9+1=10 >= 10 triggers auto-finish.
    Messages 1-8 get AI replies, message 9 triggers diary_created.
    """
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 뭐 했어?")
    mock_ai.get_reply = AsyncMock(return_value="그래? 더 알려줘!")
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "자동 완성 일기",
        "translated_text": "Auto-completed diary",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[])

    # Create session
    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp = await client.post("/api/v1/conversation")
    session_id = resp.json()["session_id"]

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            with TestClient(app) as tc:
                with tc.websocket_connect(f"/ws/conversation/{session_id}") as ws:
                    # Send 8 messages — get AI replies
                    for i in range(8):
                        ws.send_json({"type": "message", "text": f"메시지 {i+1}"})
                        data = ws.receive_json()
                        assert data["type"] == "ai_message", f"Turn {i+1}: expected ai_message, got {data['type']}"

                    # 9th message triggers auto-finish (turn_count=9, 9+1>=10)
                    ws.send_json({"type": "message", "text": "메시지 9"})
                    data = ws.receive_json()
                    assert data["type"] == "diary_created"
                    assert data["diary"]["translated_text"] == "Auto-completed diary"


# ---------------------------------------------------------------------------
# Expired session
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_expired_session_cannot_send_message(client, seed_user, db_session):
    """Sending a message to an expired session returns SESSION_EXPIRED."""
    session = ConversationSession(
        id="conv_expired_001",
        user_id=1,
        status="expired",
        turn_count=3,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        expired_at=datetime.utcnow(),
    )
    db_session.add(session)
    msg = ConversationMessage(
        session_id="conv_expired_001", role="ai",
        content="어디 갔어?", message_order=1,
    )
    db_session.add(msg)
    await db_session.commit()

    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_expired_001") as ws:
                ws.send_json({"type": "message", "text": "안녕"})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "SESSION_EXPIRED"


@pytest.mark.asyncio
async def test_expired_session_cannot_finish(client, seed_user, db_session):
    """Cannot finish an expired session."""
    session = ConversationSession(
        id="conv_expired_002",
        user_id=1,
        status="expired",
        turn_count=2,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        expired_at=datetime.utcnow(),
    )
    db_session.add(session)
    await db_session.commit()

    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_expired_002") as ws:
                ws.send_json({"type": "finish"})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "SESSION_EXPIRED"


# ---------------------------------------------------------------------------
# Double finish (already completed)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cannot_finish_already_completed_session(client, seed_user, db_session):
    """Finishing an already completed session returns 409."""
    session = ConversationSession(
        id="conv_completed_001",
        user_id=1,
        status="completed",
        turn_count=5,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
    )
    db_session.add(session)
    await db_session.commit()

    from tests.conftest import TestSession
    with patch("app.api.v1.conversation.async_session", TestSession):
        with TestClient(app) as tc:
            with tc.websocket_connect("/ws/conversation/conv_completed_001") as ws:
                ws.send_json({"type": "finish"})
                data = ws.receive_json()
                assert data["type"] == "error"
                assert data["code"] == "SESSION_ALREADY_COMPLETED"


# ---------------------------------------------------------------------------
# Invalid input edge cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_diary_update_empty_body(client, seed_diary):
    """PUT diary with no fields returns 400."""
    resp = await client.put(
        f"/api/v1/diary/{seed_diary.id}",
        json={},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_diary_list_invalid_cursor(client, seed_user):
    """Cursor with invalid (non-existent) id still returns results."""
    resp = await client.get("/api/v1/diary?cursor=999999&limit=10")
    assert resp.status_code == 200
    assert resp.json()["items"] == []
    assert resp.json()["has_next"] is False


@pytest.mark.asyncio
async def test_diary_list_limit_boundary(client, seed_user):
    """Limit of 0 or negative should be rejected by validation."""
    resp = await client.get("/api/v1/diary?limit=0")
    assert resp.status_code == 422

    resp = await client.get("/api/v1/diary?limit=-1")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_diary_list_limit_exceeds_max(client, seed_user):
    """Limit exceeding 50 should be rejected by validation."""
    resp = await client.get("/api/v1/diary?limit=100")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_tts_text_too_long(client, seed_user):
    """TTS with text over 5000 chars returns 422."""
    resp = await client.post(
        "/api/v1/speech/tts",
        json={"text": "x" * 5001},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_evaluate_missing_form_fields(client, seed_user):
    """Pronunciation evaluation without required fields returns 422."""
    # Missing audio file
    resp = await client.post(
        "/api/v1/speech/evaluate",
        data={"card_id": "1", "reference_text": "hello"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_websocket_very_long_message(client, seed_user, db_session):
    """WebSocket handles a very long text message."""
    session = ConversationSession(
        id="conv_long_msg",
        user_id=1,
        status="active",
        turn_count=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(session)
    msg = ConversationMessage(
        session_id="conv_long_msg", role="ai",
        content="오늘 뭐 했어?", message_order=1,
    )
    db_session.add(msg)
    await db_session.commit()

    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="긴 메시지 잘 받았어!")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            with TestClient(app) as tc:
                with tc.websocket_connect("/ws/conversation/conv_long_msg") as ws:
                    long_text = "나" * 5000
                    ws.send_json({"type": "message", "text": long_text})
                    data = ws.receive_json()
                    assert data["type"] == "ai_message"


# ---------------------------------------------------------------------------
# Concurrent requests (multiple conversations)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_multiple_conversations_independent(client, seed_user):
    """Creating multiple conversations produces independent sessions."""
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 어땠어?")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp1 = await client.post("/api/v1/conversation")
        resp2 = await client.post("/api/v1/conversation")

    assert resp1.status_code == 201
    assert resp2.status_code == 201
    assert resp1.json()["session_id"] != resp2.json()["session_id"]

    # Both should be independently queryable
    for sid in [resp1.json()["session_id"], resp2.json()["session_id"]]:
        resp = await client.get(f"/api/v1/conversation/{sid}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"


@pytest.mark.asyncio
async def test_nonexistent_diary_operations(client, seed_user):
    """Operations on nonexistent diary return 404."""
    resp = await client.get("/api/v1/diary/99999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "DIARY_NOT_FOUND"

    resp = await client.put("/api/v1/diary/99999", json={"original_text": "test"})
    assert resp.status_code == 404

    resp = await client.delete("/api/v1/diary/99999")
    assert resp.status_code == 404

    resp = await client.post("/api/v1/diary/99999/complete")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_websocket_binary_without_audio_session(client, seed_user, db_session):
    """Sending binary data without audio_start is silently ignored."""
    session = ConversationSession(
        id="conv_noaudio",
        user_id=1,
        status="active",
        turn_count=0,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(session)
    msg = ConversationMessage(
        session_id="conv_noaudio", role="ai",
        content="안녕!", message_order=1,
    )
    db_session.add(msg)
    await db_session.commit()

    mock_ai = AsyncMock()
    mock_ai.get_reply = AsyncMock(return_value="응!")

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            with TestClient(app) as tc:
                with tc.websocket_connect("/ws/conversation/conv_noaudio") as ws:
                    # Binary without audio session → silently ignored
                    ws.send_bytes(b"\x00\x01\x02\x03")

                    # Should still be able to send text messages
                    ws.send_json({"type": "message", "text": "안녕"})
                    data = ws.receive_json()
                    assert data["type"] == "ai_message"


@pytest.mark.asyncio
async def test_pronunciation_wav_wrong_sample_rate(client, seed_diary):
    """Pronunciation with wrong sample rate WAV returns 400."""
    wav_data = _make_wav(sample_rate=44100)  # Wrong: should be 16000
    resp = await client.post(
        "/api/v1/speech/evaluate",
        data={"card_id": "1", "reference_text": "hello"},
        files={"audio": ("test.wav", wav_data, "audio/wav")},
    )
    assert resp.status_code == 400
    assert "16kHz" in resp.json()["error"]["message"]


@pytest.mark.asyncio
async def test_pronunciation_wav_stereo(client, seed_diary):
    """Pronunciation with stereo WAV returns 400."""
    wav_data = _make_wav(num_channels=2)
    resp = await client.post(
        "/api/v1/speech/evaluate",
        data={"card_id": "1", "reference_text": "hello"},
        files={"audio": ("test.wav", wav_data, "audio/wav")},
    )
    assert resp.status_code == 400
    assert "모노" in resp.json()["error"]["message"]


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Health endpoint always returns 200."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
