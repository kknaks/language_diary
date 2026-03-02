"""Conversation API — REST endpoints + WebSocket for real-time chat."""

import asyncio
import base64
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session, get_db
from app.dependencies import get_onboarded_user
from app.exceptions import AppError
from app.models.user import User
from app.schemas.conversation import ConversationCreateResponse, ConversationDetailResponse
from app.services.conversation_service import ConversationService
from app.services.stt_service import STTError, STTSession
from app.services.tts_service import TTSError, TTSService, TTSStreamSession
from app.services.tts_task_service import create_tts_task, run_tts_generation
from app.utils.jwt import verify_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversation", tags=["conversation"])


async def _resolve_user_lang_personality(
    db: AsyncSession, user_id: int,
) -> "tuple[str, Optional[dict], Optional[str], str]":
    """Look up user profile and return (native_lang, personality, cefr_level, target_lang).

    Returns defaults ("ko", None, None, "en") if profile not found.
    """
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.profile import UserProfile
    from app.models.auth import UserLanguageLevel

    result = await db.execute(
        select(UserProfile)
        .where(UserProfile.user_id == user_id)
        .options(
            selectinload(UserProfile.native_language),
            selectinload(UserProfile.target_language),
        )
    )
    profile = result.scalar_one_or_none()
    if not profile:
        return "ko", None, None, "en"
    native_lang = profile.native_language.code if profile.native_language else "ko"
    target_lang = profile.target_language.code if profile.target_language else "en"
    personality = {
        "empathy": profile.empathy,
        "intuition": profile.intuition,
        "logic": profile.logic,
    }

    # Look up CEFR level for the target language
    cefr_level = None
    if profile.target_language_id:
        lang_level_result = await db.execute(
            select(UserLanguageLevel)
            .where(UserLanguageLevel.user_id == user_id)
            .where(UserLanguageLevel.language_id == profile.target_language_id)
        )
        lang_level = lang_level_result.scalar_one_or_none()
        if lang_level:
            cefr_level = lang_level.cefr_level

    return native_lang, personality, cefr_level, target_lang


def _ms_since(t0: float) -> float:
    """Return milliseconds elapsed since *t0* (from time.monotonic())."""
    return (time.monotonic() - t0) * 1000.0


async def _send_tts_rest(
    websocket: WebSocket, db, text: str, index: Optional[int] = None,
    voice_id: Optional[str] = None,
) -> None:
    """Fallback: Generate TTS audio via REST and send base64-encoded data to client."""
    try:
        tts_service = TTSService(db)
        audio_bytes = await tts_service.generate_bytes(text, voice_id=voice_id)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
        msg = {
            "type": "tts_audio",
            "audio_data": audio_b64,
            "format": "mp3",
        }  # type: dict
        if index is not None:
            msg["index"] = index
        await websocket.send_json(msg)
    except Exception as e:
        logger.error("TTS REST fallback failed: %s", e)
        await websocket.send_json({
            "type": "error",
            "code": "TTS_FAILED",
            "message": str(e),
        })


async def _send_tts_ws(
    websocket: WebSocket, text: str, index: int = 0,
    voice_id: Optional[str] = None, language_code: str = "ko",
    volume_gain_db: float = 0.0,
) -> None:
    """Generate TTS audio via WebSocket streaming and push chunks to client.

    Falls back to REST TTS if WebSocket connection fails.
    """
    from app.services.tts_service import _normalize_volume
    tts_session = None  # type: Optional[TTSStreamSession]
    try:
        tts_session = TTSStreamSession()
        await tts_session.connect(voice_id=voice_id, language_code=language_code)

        await tts_session.send_sentence(text)
        await tts_session.send_eos()

        chunk_index = 0
        async for audio_chunk in tts_session.receive_audio_chunks():
            if volume_gain_db != 0:
                audio_chunk = _normalize_volume(audio_chunk, volume_gain_db)
            audio_b64 = base64.b64encode(audio_chunk).decode("ascii")
            await websocket.send_json({
                "type": "tts_audio",
                "audio_data": audio_b64,
                "format": "mp3",
                "index": chunk_index,
            })
            chunk_index += 1

        await tts_session.close()
    except TTSError as e:
        logger.warning("TTS WebSocket failed: %s", e)
        if tts_session:
            await tts_session.close()
        raise
    except Exception as e:
        logger.error("TTS WebSocket unexpected error: %s", e)
        if tts_session:
            await tts_session.close()
        raise


@router.post("", response_model=ConversationCreateResponse, status_code=201)
async def create_conversation(
    current_user: User = Depends(get_onboarded_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversation session. Returns AI's first question."""
    native_lang, personality, cefr_level, target_lang = await _resolve_user_lang_personality(db, current_user.id)
    service = ConversationService(db)
    return await service.create_session(
        user_id=current_user.id,
        native_lang=native_lang,
        personality=personality,
        cefr_level=cefr_level,
        target_lang=target_lang,
    )


@router.get("/{session_id}", response_model=ConversationDetailResponse)
async def get_conversation(
    session_id: str,
    current_user: User = Depends(get_onboarded_user),
    db: AsyncSession = Depends(get_db),
):
    """Get conversation session status and message history."""
    service = ConversationService(db)
    return await service.get_session(session_id, user_id=current_user.id)


# --- WebSocket endpoint (mounted at app level, not under /api/v1) ---

async def _handle_ai_reply_streaming(
    websocket: WebSocket,
    db,
    service: ConversationService,
    session_id: str,
    user_text: str,
    pipeline_state: Optional[dict] = None,
    user_id: Optional[int] = None,
    voice_id: Optional[str] = None,
    native_lang: str = "ko",
    target_lang: str = "en",
    personality: Optional[dict] = None,
    volume_gain_db: float = 0.0,
    cefr_level: Optional[str] = None,
):
    """Handle user message with streaming AI reply + TTS WebSocket streaming.

    Pipeline:
    1. Open a single TTS WebSocket connection for the turn
    2. LLM streams sentences → send ai_chunk + flush to TTS
    3. Background task relays TTS audio chunks → tts_audio to client
    4. On turn end → ai_done + TTS close
    5. Falls back to REST TTS if WebSocket connection fails

    *pipeline_state* is a mutable dict shared with the WS message loop so that
    a ``barge_in`` message can cancel the running LLM / TTS tasks.  Keys set
    here: ``llm_task``, ``tts_session``, ``relay_task``.

    Returns True to continue message loop, False to break.
    """
    if pipeline_state is None:
        pipeline_state = {}

    t_turn_start = time.monotonic()
    tts_session = None  # type: Optional[TTSStreamSession]
    relay_task = None  # type: Optional[asyncio.Task]

    try:
        sentences = []
        index = 0
        audio_index_holder = [0]  # mutable holder for nonlocal-like access

        # --- Try to open TTS WebSocket ---
        use_ws_tts = True
        try:
            tts_session = TTSStreamSession()
            await tts_session.connect(voice_id=voice_id, language_code=native_lang)
        except TTSError as e:
            logger.warning("TTS WebSocket connection failed, falling back to REST: %s", e)
            tts_session = None
            use_ws_tts = False

        # Expose TTS session to pipeline_state for barge-in
        pipeline_state["tts_session"] = tts_session

        # --- Background: relay TTS audio chunks to client ---
        async def _relay_tts_audio():
            """Read audio chunks from TTS WebSocket and push to client."""
            from app.services.tts_service import _normalize_volume
            if not tts_session:
                return
            try:
                async for audio_chunk in tts_session.receive_audio_chunks():
                    if volume_gain_db != 0:
                        audio_chunk = _normalize_volume(audio_chunk, volume_gain_db)
                    audio_b64 = base64.b64encode(audio_chunk).decode("ascii")
                    await websocket.send_json({
                        "type": "tts_audio",
                        "audio_data": audio_b64,
                        "format": "mp3",
                        "index": audio_index_holder[0],
                    })
                    audio_index_holder[0] += 1
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.error("TTS audio relay error: %s", e)

        if use_ws_tts:
            relay_task = asyncio.create_task(_relay_tts_audio())
            pipeline_state["relay_task"] = relay_task

        # --- REST fallback collectors (used only if WS fails) ---
        rest_tts_tasks = []  # type: list

        # --- Wrap LLM streaming in a task so barge_in can cancel it ---
        async def _run_llm():
            """Run the LLM streaming loop; populates *sentences* as a side-effect."""
            nonlocal index, use_ws_tts, tts_session, relay_task
            t_first_sentence = None  # type: Optional[float]
            async for sentence in service.handle_user_message_streaming(
                session_id, user_text,
                native_lang=native_lang, personality=personality,
                cefr_level=cefr_level, target_lang=target_lang,
            ):
                if t_first_sentence is None:
                    t_first_sentence = time.monotonic()
                    logger.info(
                        "[latency] LLM first sentence: %.0f ms",
                        _ms_since(t_turn_start),
                    )
                sentences.append(sentence)
                await websocket.send_json({
                    "type": "ai_message_chunk",
                    "text": sentence,
                    "index": index,
                    "is_final": False,
                })

                if use_ws_tts and tts_session:
                    try:
                        await tts_session.send_sentence(sentence)
                    except TTSError as e:
                        logger.warning("TTS WS send failed at sentence %d, switching to REST: %s", index, e)
                        use_ws_tts = False
                        await tts_session.close()
                        tts_session = None
                        pipeline_state["tts_session"] = None
                        if relay_task:
                            relay_task.cancel()
                            try:
                                await relay_task
                            except (asyncio.CancelledError, Exception):
                                pass
                            relay_task = None
                            pipeline_state["relay_task"] = None
                        tts_svc = TTSService(db)
                        rest_tts_tasks.append((index, asyncio.create_task(tts_svc.generate_bytes(sentence, voice_id=voice_id))))  # noqa: E501
                elif not use_ws_tts:
                    tts_svc = TTSService(db)
                    rest_tts_tasks.append((index, asyncio.create_task(tts_svc.generate_bytes(sentence, voice_id=voice_id))))  # noqa: E501

                index += 1

        llm_task = asyncio.create_task(_run_llm())
        pipeline_state["llm_task"] = llm_task

        try:
            await llm_task
        except asyncio.CancelledError:
            logger.info("LLM task cancelled (barge-in)")
            return True  # barge-in handled; continue message loop

        if sentences:
            # Send final chunk marker (for frontend compatibility)
            await websocket.send_json({
                "type": "ai_message_chunk",
                "text": "",
                "index": index,
                "is_final": True,
            })

            if use_ws_tts and tts_session:
                # Send EOS so ElevenLabs returns isFinal and relay finishes cleanly
                await tts_session.send_eos()
                if relay_task:
                    try:
                        await asyncio.wait_for(relay_task, timeout=30.0)
                    except (asyncio.TimeoutError, asyncio.CancelledError):
                        logger.warning("TTS relay task timed out or cancelled")
                    relay_task = None
                await tts_session.close()
                tts_session = None
            else:
                # REST fallback: send all TTS results in order
                for tts_idx, task in rest_tts_tasks:
                    try:
                        audio_bytes = await task
                        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
                        await websocket.send_json({
                            "type": "tts_audio",
                            "audio_data": audio_b64,
                            "format": "mp3",
                            "index": tts_idx,
                        })
                    except Exception as e:
                        logger.error("REST TTS failed for chunk %d: %s", tts_idx, e)
                        await websocket.send_json({
                            "type": "error",
                            "code": "TTS_FAILED",
                            "message": str(e),
                        })

            # Signal turn done AFTER all TTS audio has been sent
            await websocket.send_json({"type": "ai_done"})

            return True  # continue loop
        else:
            # No sentences yielded — max turns reached, auto-finish happened
            if tts_session:
                await tts_session.close()
            if relay_task:
                relay_task.cancel()
            diary_resp = await service.finish_conversation(
                session_id, user_id=user_id,
                native_lang=native_lang, target_lang=target_lang,
                cefr_level=cefr_level,
            )
            # Launch background TTS generation for learning cards
            card_ids = [c.id for c in diary_resp.learning_cards]
            if card_ids:
                task_id = await create_tts_task(db, diary_resp.id, card_ids)
                asyncio.create_task(run_tts_generation(task_id, card_ids, async_session))
                diary_resp.task_id = task_id
            await websocket.send_json(
                {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
            )
            return False  # break loop

    except AppError as e:
        if tts_session:
            await tts_session.close()
        if relay_task:
            relay_task.cancel()
        await websocket.send_json(
            {"type": "error", "code": e.code, "message": e.message}
        )
        return False  # break loop
    except Exception as e:
        logger.exception("Unexpected error in _handle_ai_reply_streaming")
        if tts_session:
            await tts_session.close()
        if relay_task:
            relay_task.cancel()
        await websocket.send_json(
            {"type": "error", "code": "INTERNAL_ERROR", "message": str(e)}
        )
        return False


async def conversation_websocket(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
):
    """WebSocket handler for real-time conversation with audio streaming.

    Authentication: pass JWT token as query parameter `?token=<jwt>`.

    On connect: creates session, sends greeting + TTS, then opens a long-lived
    STT session. A commit listener background task consumes auto-committed
    transcripts from ElevenLabs VAD and drives the AI pipeline.

    Client → Server:
      { "type": "message", "text": "..." }       — Text message
      (binary frames)                             — Audio chunks (PCM 16kHz 16-bit mono)
      { "type": "barge_in" }                      — Cancel current AI reply + TTS
      { "type": "nudge" }                         — Silence timeout, AI re-prompts
      { "type": "finish" }                        — Finish conversation

    Server → Client:
      { "type": "session_created", "session_id": "..." } — Session ready
      { "type": "stt_interim", "text": "..." }    — Real-time interim transcription
      { "type": "stt_final", "text": "..." }      — Final transcription (ElevenLabs auto-commit)
      { "type": "ai_message", "text": "..." }     — AI follow-up question (single)
      { "type": "ai_message_chunk", "text": "...", "index": N, "is_final": bool }
      { "type": "tts_audio", "audio_data": "<base64>", "format": "mp3", "index": N }
      { "type": "diary_created", "diary": {...} }  — Diary + learning cards
      { "type": "error", "code": "...", "message": "..." }
    """
    # Authenticate via token query parameter
    user_id = None
    if token:
        user_id = verify_access_token(token)

    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    # Resolve user profile: voice_id, languages, personality, volume for TTS/AI personalization
    user_voice_id = None  # type: Optional[str]
    native_lang = "ko"
    target_lang = "en"
    personality = None  # type: Optional[dict]
    cefr_level = None  # type: Optional[str]
    volume_gain_db = 0.0

    async with async_session() as db:
        # Look up user's profile (voice, languages, personality)
        try:
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            from app.models.profile import UserProfile
            from app.models.auth import UserLanguageLevel
            from app.models.seed import Language, Voice  # noqa: F401
            profile_result = await db.execute(
                select(UserProfile)
                .where(UserProfile.user_id == user_id)
                .options(
                    selectinload(UserProfile.voice),
                    selectinload(UserProfile.native_language),
                    selectinload(UserProfile.target_language),
                )
            )
            user_profile = profile_result.scalar_one_or_none()
            if user_profile:
                if user_profile.voice:
                    user_voice_id = user_profile.voice.elevenlabs_voice_id
                    volume_gain_db = float(user_profile.voice.volume_gain_db or 0)
                if user_profile.native_language:
                    native_lang = user_profile.native_language.code
                if user_profile.target_language:
                    target_lang = user_profile.target_language.code
                personality = {
                    "empathy": user_profile.empathy,
                    "intuition": user_profile.intuition,
                    "logic": user_profile.logic,
                }
                # Look up CEFR level for the target language
                if user_profile.target_language_id:
                    lang_level_result = await db.execute(
                        select(UserLanguageLevel)
                        .where(UserLanguageLevel.user_id == user_id)
                        .where(UserLanguageLevel.language_id == user_profile.target_language_id)
                    )
                    lang_level = lang_level_result.scalar_one_or_none()
                    if lang_level:
                        cefr_level = lang_level.cefr_level
        except Exception:
            logger.warning("Failed to resolve user profile, using defaults")

        service = ConversationService(db)
        stt_session = None
        # pipeline_state is shared between the message loop and
        # _handle_ai_reply_streaming so that barge_in can cancel running tasks.
        pipeline_state: dict = {}
        ai_pipeline_task: Optional[asyncio.Task] = None
        commit_listener_task: Optional[asyncio.Task] = None

        async def _cancel_pipeline() -> None:
            """Cancel in-flight LLM / TTS / relay tasks (barge-in)."""
            nonlocal ai_pipeline_task
            for key in ("llm_task", "relay_task"):
                task = pipeline_state.pop(key, None)
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass
            tts_sess = pipeline_state.pop("tts_session", None)
            if tts_sess:
                await tts_sess.close()
            if ai_pipeline_task and not ai_pipeline_task.done():
                ai_pipeline_task.cancel()
                try:
                    await ai_pipeline_task
                except (asyncio.CancelledError, Exception):
                    pass
                ai_pipeline_task = None

        try:
            # --- Session creation on connect ---
            session_id = await service.create_session_ws(user_id=user_id)
            await websocket.send_json({
                "type": "session_created",
                "session_id": session_id,
            })

            # --- AI greeting ---
            greeting = await service.generate_greeting(
                session_id, native_lang=native_lang, personality=personality,
                cefr_level=cefr_level, target_lang=target_lang,
            )
            await websocket.send_json({
                "type": "ai_message",
                "text": greeting,
            })
            # Try WebSocket TTS for greeting, fall back to REST
            try:
                await _send_tts_ws(
                    websocket, greeting, index=0,
                    voice_id=user_voice_id, language_code=native_lang,
                    volume_gain_db=volume_gain_db,
                )
            except Exception as e:
                logger.warning("Greeting TTS WS failed, falling back to REST: %s", e)
                await _send_tts_rest(websocket, db, greeting, index=0, voice_id=user_voice_id)
            # Signal greeting turn done so frontend transitions to listening
            await websocket.send_json({"type": "ai_done"})

            # --- Open long-lived STT session ---
            try:
                stt_session = STTSession(
                    settings.ELEVENLABS_API_KEY,
                    client_ws=websocket,
                )
                await stt_session.connect()
                logger.info("Long-lived STT session created after greeting")
            except STTError as e:
                logger.error("STT connection failed: %s", e)
                await websocket.send_json({
                    "type": "error",
                    "code": "STT_FAILED",
                    "message": str(e),
                })
                stt_session = None

            # --- Commit listener: drives AI pipeline from STT auto-commits ---
            async def _commit_listener():
                """Consume committed transcripts and trigger AI pipeline."""
                nonlocal ai_pipeline_task
                if not stt_session:
                    return
                async for text in stt_session.iter_commits():
                    # Wait for any in-flight pipeline to finish before starting new one
                    if ai_pipeline_task and not ai_pipeline_task.done():
                        logger.info("Commit received while pipeline running, waiting...")
                        try:
                            await ai_pipeline_task
                        except (asyncio.CancelledError, Exception):
                            pass

                    logger.info("Commit listener: triggering AI pipeline for '%s'", text[:80])
                    ai_pipeline_task = asyncio.create_task(
                        _handle_ai_reply_streaming(
                            websocket, db, service, session_id, text,
                            pipeline_state=pipeline_state,
                            user_id=user_id,
                            voice_id=user_voice_id,
                            native_lang=native_lang,
                            target_lang=target_lang,
                            personality=personality,
                            volume_gain_db=volume_gain_db,
                            cefr_level=cefr_level,
                        )
                    )
                    try:
                        cont = await ai_pipeline_task
                        if not cont:
                            # Auto-finish (max turns) — break out
                            break
                    except asyncio.CancelledError:
                        logger.info("AI pipeline cancelled in commit listener")
                    except Exception:
                        logger.exception("AI pipeline error in commit listener")
                    finally:
                        ai_pipeline_task = None

            if stt_session:
                commit_listener_task = asyncio.create_task(_commit_listener())

            # --- Message loop ---
            while True:
                raw = await websocket.receive()

                if raw["type"] == "websocket.disconnect":
                    break

                text_data = raw.get("text")
                bytes_data = raw.get("bytes")

                # --- Binary frame: audio chunk ---
                if bytes_data:
                    # Skip sending audio to STT while AI pipeline is running
                    # to prevent TTS echo (speaker → mic → STT) from
                    # contaminating speech recognition.
                    if stt_session and not (ai_pipeline_task and not ai_pipeline_task.done()):
                        try:
                            await stt_session.send_audio(bytes_data)
                        except STTError as e:
                            logger.error("STT send_audio failed: %s", e)
                            await websocket.send_json({
                                "type": "error",
                                "code": "STT_FAILED",
                                "message": str(e),
                            })
                    continue

                # --- Text frame: JSON message ---
                if not text_data:
                    continue

                try:
                    data = json.loads(text_data)
                except json.JSONDecodeError:
                    await websocket.send_json(
                        {"type": "error", "code": "VALIDATION_ERROR", "message": "유효하지 않은 JSON입니다."}
                    )
                    continue

                msg_type = data.get("type")

                # ── text message ─────────────────────────────────
                if msg_type == "message":
                    text = data.get("text", "").strip()
                    if not text:
                        await websocket.send_json(
                            {"type": "error", "code": "VALIDATION_ERROR", "message": "메시지가 비어있습니다."}
                        )
                        continue

                    cont = await _handle_ai_reply_streaming(
                        websocket, db, service, session_id, text,
                        pipeline_state=pipeline_state,
                        user_id=user_id,
                        voice_id=user_voice_id,
                        native_lang=native_lang,
                        target_lang=target_lang,
                        personality=personality,
                        volume_gain_db=volume_gain_db,
                        cefr_level=cefr_level,
                    )
                    if not cont:
                        break

                # ── nudge (silence timeout) ────────────────────
                elif msg_type == "nudge":
                    # Ignore nudge if AI pipeline is currently running
                    if ai_pipeline_task and not ai_pipeline_task.done():
                        logger.info("Nudge ignored — AI pipeline in progress")
                        continue
                    logger.info("Nudge received (user silent for 10s)")
                    cont = await _handle_ai_reply_streaming(
                        websocket, db, service, session_id, "[silence]",
                        pipeline_state=pipeline_state,
                        user_id=user_id,
                        voice_id=user_voice_id,
                        native_lang=native_lang,
                        target_lang=target_lang,
                        personality=personality,
                        volume_gain_db=volume_gain_db,
                        cefr_level=cefr_level,
                    )
                    if not cont:
                        break

                # ── barge_in ─────────────────────────────────────
                elif msg_type == "barge_in":
                    logger.info("Barge-in received, cancelling pipeline")
                    await _cancel_pipeline()
                    await websocket.send_json({"type": "barge_in_ack"})

                # ── finish ───────────────────────────────────────
                elif msg_type == "finish":
                    # Cancel commit listener + pipeline before finishing
                    if commit_listener_task and not commit_listener_task.done():
                        commit_listener_task.cancel()
                        try:
                            await commit_listener_task
                        except (asyncio.CancelledError, Exception):
                            pass
                        commit_listener_task = None
                    await _cancel_pipeline()
                    if stt_session:
                        await stt_session.close()
                        stt_session = None
                    try:
                        diary_resp = await service.finish_conversation(
                            session_id, user_id=user_id,
                            native_lang=native_lang, target_lang=target_lang,
                            cefr_level=cefr_level,
                        )
                        # Launch background TTS generation for learning cards
                        card_ids = [c.id for c in diary_resp.learning_cards]
                        if card_ids:
                            task_id = await create_tts_task(db, diary_resp.id, card_ids)
                            asyncio.create_task(run_tts_generation(task_id, card_ids, async_session))
                            diary_resp.task_id = task_id
                        await websocket.send_json(
                            {"type": "diary_created", "diary": diary_resp.model_dump(mode="json")}
                        )
                    except AppError as e:
                        await websocket.send_json(
                            {"type": "error", "code": e.code, "message": e.message}
                        )
                    break

                # ── unknown type ─────────────────────────────────
                else:
                    await websocket.send_json(
                        {"type": "error", "code": "VALIDATION_ERROR", "message": f"알 수 없는 메시지 타입: {msg_type}"}
                    )

        except WebSocketDisconnect:
            logger.info("WebSocket disconnected: session_id=%s", session_id if 'session_id' in dir() else 'unknown')
        except Exception:
            logger.exception("WebSocket error")
            try:
                await websocket.send_json(
                    {"type": "error", "code": "INTERNAL_ERROR", "message": "서버 내부 오류가 발생했습니다."}
                )
            except Exception:
                pass
        finally:
            if commit_listener_task and not commit_listener_task.done():
                commit_listener_task.cancel()
                try:
                    await commit_listener_task
                except (asyncio.CancelledError, Exception):
                    pass
            await _cancel_pipeline()
            if stt_session:
                await stt_session.close()
            try:
                await websocket.close()
            except Exception:
                pass
