# Future: Custom Voice Pipeline (Cost Optimization)

## Current Architecture (MVP)

ElevenLabs Conversational AI handles the full pipeline:
- **STT** (speech-to-text)
- **LLM** (language model)
- **TTS** (text-to-speech)
- **VAD** (voice activity detection)
- **Barge-in** (interruption handling)

All via a single WebSocket connection. Simple, fast to implement, but higher per-minute cost.

## Future Custom Pipeline

When usage grows and cost becomes a concern, build a direct pipeline:

### Components

| Component | Option A | Option B |
|-----------|----------|----------|
| **STT** | ElevenLabs Scribe v2 | OpenAI Whisper |
| **LLM** | OpenAI GPT-4o-mini (backend) | Claude Haiku |
| **TTS** | ElevenLabs Streaming TTS | — |
| **VAD** | silero-vad (frontend) | WebRTC VAD |
| **Barge-in** | Frontend detects → cancels backend | — |

### Architecture

```
[Frontend]
  ├── Mic → VAD (silero-vad) → PCM chunks
  ├── WebSocket to Backend
  └── TTS Audio playback

[Backend]
  ├── Receives PCM → STT (ElevenLabs Scribe / Whisper)
  ├── STT text → LLM (OpenAI streaming)
  ├── LLM sentences → TTS (ElevenLabs streaming)
  └── Audio chunks → Frontend via WebSocket
```

### Barge-in Flow
1. Frontend VAD detects user speech during AI playback
2. Frontend sends `barge_in` message via WebSocket
3. Backend cancels in-flight LLM + TTS tasks
4. Frontend stops audio playback
5. New STT session begins

### Cost Comparison (Estimate)

| | ConvAI | Custom Pipeline |
|---|---|---|
| 5-min conversation | ~$0.50 | ~$0.10-0.15 |
| Components | 1 API | 3 separate APIs |
| Complexity | Low | High |
| Latency control | None | Full |

### Migration Path

1. Keep existing ConvAI endpoints (backward compatible)
2. Add `/ws/conversation-v2` WebSocket endpoint
3. Frontend feature flag to switch between ConvAI and custom
4. A/B test latency and quality
5. Deprecate ConvAI once custom pipeline is stable

### Files to Reactivate

The original pipeline code is preserved (not deleted):
- `backend/app/services/stt_service.py`
- `backend/app/services/tts_service.py`
- `backend/app/api/v1/conversation.py` (WebSocket handler)
- `frontend/src/services/websocket.ts`
