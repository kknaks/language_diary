"""Integration tests — full user flow from conversation creation to pronunciation evaluation.

Tests the complete lifecycle:
  1. Create conversation → AI first message
  2. Send messages via WebSocket → AI replies
  3. Finish conversation → diary + learning cards created
  4. Verify diary appears in list and detail endpoints
  5. Generate TTS for learning card text
  6. Evaluate pronunciation for a learning card
"""

import struct
import pytest
from unittest.mock import AsyncMock, patch

from starlette.testclient import TestClient

from app.main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_wav(sample_rate=16000, bits_per_sample=16, num_channels=1, data_size=3200):
    """Build a minimal valid WAV header + silence."""
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


MOCK_DIARY = {
    "original_text": "오늘 회사에서 팀장님과 프로젝트 일정 회의를 했다. 다음 주까지 마감이라 좀 빡셌다.",
    "translated_text": (
        "I had a project schedule meeting with my team leader at work today. "
        "The deadline is next week, so it was quite hectic."
    ),
}

MOCK_LEARNING_POINTS = [
    {
        "card_type": "word",
        "content_en": "meeting",
        "content_ko": "회의",
        "part_of_speech": "noun",
        "cefr_level": "A2",
        "example_en": "I had a meeting at work today.",
        "example_ko": "오늘 회사에서 회의했어.",
    },
    {
        "card_type": "word",
        "content_en": "deadline",
        "content_ko": "마감",
        "part_of_speech": "noun",
        "cefr_level": "B1",
        "example_en": "The deadline is next week.",
        "example_ko": "마감이 다음 주야.",
    },
    {
        "card_type": "phrase",
        "content_en": "quite hectic",
        "content_ko": "꽤 바쁜",
        "part_of_speech": None,
        "cefr_level": "B1",
        "example_en": "It was quite hectic at work.",
        "example_ko": "회사에서 꽤 바빴다.",
    },
]

SAMPLE_AZURE_RESPONSE = {
    "RecognitionStatus": "Success",
    "NBest": [{
        "Confidence": 0.95,
        "Lexical": "meeting",
        "PronunciationAssessment": {
            "AccuracyScore": 88.0,
            "FluencyScore": 82.0,
            "CompletenessScore": 85.0,
            "PronScore": 85.0,
        },
        "Words": [{
            "Word": "meeting",
            "PronunciationAssessment": {
                "AccuracyScore": 88.0,
                "ErrorType": "None",
            },
        }],
    }],
}


# ---------------------------------------------------------------------------
# Full E2E flow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_conversation_to_learning_flow(client, seed_user, tmp_path):
    """Full flow: create conversation → messages → finish → diary → TTS → pronunciation."""

    # ── Step 1: Create conversation ──────────────────────────────────
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 하루 어땠어? 😊")
    mock_ai.get_reply = AsyncMock(side_effect=[
        "어떤 회의였어? 누구랑 했어?",
        "결과는 어땠어? 힘들진 않았어?",
    ])
    mock_ai.generate_diary = AsyncMock(return_value=MOCK_DIARY)
    mock_ai.extract_learning_points = AsyncMock(return_value=MOCK_LEARNING_POINTS)

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp = await client.post("/api/v1/conversation")

    assert resp.status_code == 201
    session_id = resp.json()["session_id"]
    assert resp.json()["first_message"] == "오늘 하루 어땠어? 😊"

    # ── Step 2: Send messages via WebSocket ──────────────────────────
    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            with TestClient(app) as tc:
                with tc.websocket_connect(f"/ws/conversation/{session_id}") as ws:
                    # User message 1
                    ws.send_json({"type": "message", "text": "회사에서 회의했어"})
                    data = ws.receive_json()
                    assert data["type"] == "ai_message"
                    assert data["text"] == "어떤 회의였어? 누구랑 했어?"

                    # User message 2
                    ws.send_json({"type": "message", "text": "팀장님이랑 프로젝트 일정 잡았어"})
                    data = ws.receive_json()
                    assert data["type"] == "ai_message"
                    assert data["text"] == "결과는 어땠어? 힘들진 않았어?"

                    # ── Step 3: Finish conversation ──────────────────
                    ws.send_json({"type": "finish"})
                    data = ws.receive_json()
                    assert data["type"] == "diary_created"

                    diary = data["diary"]
                    assert diary["status"] == "translated"
                    assert "회사에서" in diary["original_text"]
                    assert "meeting" in diary["translated_text"]
                    assert len(diary["learning_cards"]) == 3

    diary_id = diary["id"]

    # ── Step 4: Verify diary in list endpoint ────────────────────────
    resp = await client.get("/api/v1/diary")
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert any(d["id"] == diary_id for d in items)

    # ── Step 5: Verify diary detail with learning cards ──────────────
    resp = await client.get(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["id"] == diary_id
    assert len(detail["learning_cards"]) == 3
    card_id = detail["learning_cards"][0]["id"]

    # ── Step 6: Generate TTS for learning card text ──────────────────
    from app.services import tts_service
    tts_service._elevenlabs_cb.reset()
    tts_service._openai_tts_cb.reset()

    with patch("app.services.tts_service.AUDIO_DIR", tmp_path):
        with patch(
            "app.services.tts_service._generate_elevenlabs_tts",
            new_callable=AsyncMock,
            return_value=b"mp3-audio-bytes",
        ):
            resp = await client.post(
                "/api/v1/speech/tts",
                json={"text": detail["learning_cards"][0]["content_en"]},
            )

    assert resp.status_code == 200
    assert resp.json()["cached"] is False
    assert resp.json()["audio_url"].endswith(".mp3")

    # ── Step 7: Evaluate pronunciation ───────────────────────────────
    from app.services import pronunciation_service
    pronunciation_service._azure_cb.reset()

    wav_data = _make_wav()

    with patch("app.services.pronunciation_service.UPLOAD_DIR", tmp_path):
        with patch(
            "app.services.pronunciation_service._call_azure_pronunciation",
            new_callable=AsyncMock,
            return_value=SAMPLE_AZURE_RESPONSE,
        ):
            resp = await client.post(
                "/api/v1/speech/evaluate",
                data={
                    "card_id": str(card_id),
                    "reference_text": "meeting",
                },
                files={"audio": ("test.wav", wav_data, "audio/wav")},
            )

    assert resp.status_code == 200
    eval_data = resp.json()
    assert eval_data["overall_score"] == 85.0
    assert eval_data["attempt_number"] == 1
    assert eval_data["card_id"] == card_id

    # ── Step 8: Verify conversation is completed ─────────────────────
    resp = await client.get(f"/api/v1/conversation/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
    assert resp.json()["diary_id"] == diary_id


@pytest.mark.asyncio
async def test_conversation_with_audio_stt_then_finish(client, seed_user, tmp_path):
    """Integration: audio streaming → STT → AI reply → finish → diary."""
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 뭐 했어?")
    mock_ai.get_reply = AsyncMock(return_value="재밌었겠다!")
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "오늘 친구와 카페에 갔다.",
        "translated_text": "I went to a cafe with a friend today.",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[
        {
            "card_type": "word",
            "content_en": "cafe",
            "content_ko": "카페",
            "part_of_speech": "noun",
            "cefr_level": "A1",
            "example_en": "I went to a cafe.",
            "example_ko": "카페에 갔다.",
        },
    ])

    # Create conversation
    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp = await client.post("/api/v1/conversation")
    assert resp.status_code == 201
    session_id = resp.json()["session_id"]

    # Mock STT session
    mock_stt = AsyncMock()
    mock_stt.connect = AsyncMock()
    mock_stt.send_audio = AsyncMock()
    mock_stt.commit_and_wait_final = AsyncMock(return_value="친구랑 카페 갔어")
    mock_stt.close = AsyncMock()

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        with patch("app.api.v1.conversation.STTSession", return_value=mock_stt):
            from tests.conftest import TestSession
            with patch("app.api.v1.conversation.async_session", TestSession):
                with TestClient(app) as tc:
                    with tc.websocket_connect(f"/ws/conversation/{session_id}") as ws:
                        # Audio streaming flow
                        ws.send_json({"type": "audio_start"})
                        ws.send_bytes(b"\x00\x01\x02\x03")
                        ws.send_json({"type": "audio_end"})

                        stt_final = ws.receive_json()
                        assert stt_final["type"] == "stt_final"
                        assert stt_final["text"] == "친구랑 카페 갔어"

                        ai_msg = ws.receive_json()
                        assert ai_msg["type"] == "ai_message"
                        assert ai_msg["text"] == "재밌었겠다!"

                        # Finish
                        ws.send_json({"type": "finish"})
                        result = ws.receive_json()
                        assert result["type"] == "diary_created"
                        assert len(result["diary"]["learning_cards"]) == 1

    # Verify diary persisted
    diary_id = result["diary"]["id"]
    resp = await client.get(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 200
    assert resp.json()["translated_text"] == "I went to a cafe with a friend today."


@pytest.mark.asyncio
async def test_diary_edit_after_creation(client, seed_user):
    """Integration: create diary via conversation, then edit it."""
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 어땠어?")
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "원래 일기 내용",
        "translated_text": "Original diary content",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[])

    # Create and finish conversation
    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp = await client.post("/api/v1/conversation")
        session_id = resp.json()["session_id"]

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            with TestClient(app) as tc:
                with tc.websocket_connect(f"/ws/conversation/{session_id}") as ws:
                    ws.send_json({"type": "finish"})
                    data = ws.receive_json()
                    assert data["type"] == "diary_created"
                    diary_id = data["diary"]["id"]

    # Edit the diary
    resp = await client.put(
        f"/api/v1/diary/{diary_id}",
        json={"translated_text": "Edited diary content"},
    )
    assert resp.status_code == 200
    assert resp.json()["translated_text"] == "Edited diary content"

    # Verify edit persisted
    resp = await client.get(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 200
    assert resp.json()["translated_text"] == "Edited diary content"


@pytest.mark.asyncio
async def test_diary_complete_and_delete_flow(client, seed_user):
    """Integration: create diary → mark complete → soft delete → not in list."""
    mock_ai = AsyncMock()
    mock_ai.get_first_message = AsyncMock(return_value="오늘 어땠어?")
    mock_ai.generate_diary = AsyncMock(return_value={
        "original_text": "삭제할 일기",
        "translated_text": "Diary to delete",
    })
    mock_ai.extract_learning_points = AsyncMock(return_value=[])

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        resp = await client.post("/api/v1/conversation")
        session_id = resp.json()["session_id"]

    with patch("app.services.conversation_service.AIService", return_value=mock_ai):
        from tests.conftest import TestSession
        with patch("app.api.v1.conversation.async_session", TestSession):
            with TestClient(app) as tc:
                with tc.websocket_connect(f"/ws/conversation/{session_id}") as ws:
                    ws.send_json({"type": "finish"})
                    data = ws.receive_json()
                    diary_id = data["diary"]["id"]

    # Mark complete
    resp = await client.post(f"/api/v1/diary/{diary_id}/complete")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"

    # Cannot complete again
    resp = await client.post(f"/api/v1/diary/{diary_id}/complete")
    assert resp.status_code == 409

    # Soft delete
    resp = await client.delete(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 204

    # Should not appear in list
    resp = await client.get("/api/v1/diary")
    assert resp.status_code == 200
    assert all(d["id"] != diary_id for d in resp.json()["items"])

    # Should return 404 on detail
    resp = await client.get(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 404
