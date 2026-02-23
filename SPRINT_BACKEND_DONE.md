# Backend Sprint 결과 요약

## Sprint 1 — DB Setup + Diary CRUD API
**커밋:** `ee0a791`

### 구현 내용
- FastAPI 프로젝트 구조: `app/api/v1/`, `app/models/`, `app/repositories/`, `app/services/`
- SQLAlchemy async 모델 7개 테이블 (users, diaries, conversation_sessions, conversation_messages, learning_cards, pronunciation_results, tts_cache)
- Alembic 마이그레이션 + MVP 유저 시딩 (user_id=1)
- 엔드포인트:
  - `GET /health` — 헬스체크
  - `GET /api/v1/diary` — 일기 목록 (cursor pagination)
  - `GET /api/v1/diary/{id}` — 일기 상세 (learning_cards 포함)
  - `PUT /api/v1/diary/{id}` — 일기 수정
  - `DELETE /api/v1/diary/{id}` — 소프트 삭제
  - `POST /api/v1/diary/{id}/complete` — 학습 완료
- 에러 응답 포맷: `{"error": {"code": "...", "message": "...", "detail": "..."}}`
- **테스트: 18개 통과**

### 파일 구조
```
backend/
├── app/
│   ├── api/v1/diary.py, health.py, user.py
│   ├── models/user.py, diary.py, conversation.py, learning_card.py, pronunciation.py, tts_cache.py
│   ├── repositories/diary_repo.py, user_repo.py
│   ├── services/diary_service.py
│   ├── config.py, database.py, main.py, exceptions.py
├── alembic/
├── tests/api/test_diary.py, test_health.py, test_user.py
```

---

## Sprint 2 — AI Conversation Engine + WebSocket
**커밋:** `308e3f9`

### 구현 내용
- `POST /api/v1/conversation` — 대화 세션 생성 + AI 첫 질문 반환
- `GET /api/v1/conversation/{session_id}` — 세션 상태/기록 조회
- `WS /ws/conversation/{session_id}` — WebSocket 실시간 대화
- `app/services/ai_service.py`:
  - `get_first_message()` — AI 첫 질문 생성
  - `get_reply()` — 대화 맥락 유지 후속 질문 (OpenAI)
  - `generate_diary()` — 대화 종합 → 한국어 원문 + 영어 번역 일기 생성
  - `extract_learning_points()` — 학습 포인트 추출 (단어/구문, CEFR 등급)
- `app/services/conversation_service.py`:
  - 세션 생성/조회/메시지 처리/완료
  - 대화 턴 카운트 + 최대 10턴 제한
  - 세션 상태 관리: created → active → summarizing → completed / expired
- `app/repositories/conversation_repo.py`: 대화 데이터 영속화
- WebSocket 메시지 타입:
  - 클라이언트→서버: `message`, `finish`
  - 서버→클라이언트: `ai_message`, `diary_created`, `error`
- **테스트: 46개 통과** (WebSocket 7개 + AI Service 7개 + Conversation Service 9개 + 기존 18개 + 기타 5개)

### 핵심 파일
```
backend/app/
├── api/v1/conversation.py    # REST + WebSocket 핸들러
├── services/ai_service.py    # OpenAI 연동
├── services/conversation_service.py
├── repositories/conversation_repo.py
tests/
├── api/test_websocket.py
├── unit/test_ai_service.py, test_conversation_service.py
```

---

## Sprint 3 — ElevenLabs STT Integration
**커밋:** `06d346a`

### 구현 내용
- `app/services/stt_service.py`:
  - `STTSession` 클래스: connect() → send_audio() → commit_and_wait_final() → close()
  - ElevenLabs STT WebSocket 스트리밍 API 연동
  - `validate_pcm_audio()` — 16kHz 16-bit mono PCM 포맷 검증
  - `STTError` 예외 클래스
  - 실시간 interim 텍스트 전달 (partial_transcript → stt_interim)
  - committed_transcript → asyncio.Event로 final 텍스트 반환
- WebSocket 핸들러 업데이트:
  - `audio_start` → STT 세션 생성
  - Binary frames → ElevenLabs 전달
  - `audio_end` → commit + final 텍스트 → AI 응답 파이프라인
  - 에러 시 텍스트 입력 폴백 (WebSocket 유지)
  - finally 블록에서 STT 세션 정리
- **테스트: 73개 통과** (STT 15개 유닛 + WebSocket 6개 통합 + 기존 52개)

### 핵심 파일
```
backend/app/services/stt_service.py
backend/tests/unit/test_stt_service.py
backend/tests/api/test_websocket.py  # 6개 STT 통합 테스트 추가
```

---

## Sprint 4 — TTS + Pronunciation Evaluation
**커밋:** `2bd29a7`

### 구현 내용
- `POST /api/v1/speech/tts` — TTS 생성 엔드포인트
- `app/services/tts_service.py`:
  - ElevenLabs TTS API 연동
  - TTS 캐싱 (tts_cache 테이블 + text_hash SHA-256)
  - OpenAI TTS 폴백 (ElevenLabs 장애 시)
  - 오디오 파일 로컬 디스크 저장 (MP3)
- `POST /api/v1/speech/evaluate` — 발음 평가 엔드포인트
- `app/services/pronunciation_service.py`:
  - Azure Speech SDK REST API 연동 (코드 구현, API key "xxx"로 mock)
  - WAV 16kHz 16-bit mono 검증 + 최대 10MB
  - 점수 파싱: accuracy/fluency/completeness/overall + word_scores
  - pronunciation_results 저장 + attempt_number 관리
- **테스트: 132개 통과** (TTS 12개 + Pronunciation 5개 + 기존 73개 + 기타)

### 핵심 파일
```
backend/app/
├── api/v1/speech.py
├── services/tts_service.py
├── services/pronunciation_service.py
tests/unit/
├── test_tts_service.py
├── test_pronunciation_service.py
```

---

## Sprint 5 — Error Handling + Middleware + Deploy Prep
**커밋:** `aa5c0d2`

### 구현 내용
- Rate limiting 미들웨어 (429 Too Many Requests)
- Circuit Breaker 패턴 공통 모듈 (OpenAI, ElevenLabs, Azure)
- Retry with exponential backoff (최대 3회)
- 전체 에러 핸들러 정리 (PRD 10.4 에러 코드 준수)
- Request/Response 로깅 미들웨어
- CORS 설정 (React Native 대응)
- 정적 파일 서빙 (/uploads/* for TTS audio)
- Alembic 마이그레이션 최종 확인
- Docker 파일 정리 (Dockerfile, docker-compose.yml)
- **테스트: 158개 통과**

---

## Sprint 6 — Final Tests + Bug Fixes + Production Ready
**커밋:** `c6aaa59`

### 구현 내용
- 통합 테스트 추가: 전체 플로우 (대화 → 일기 생성 → 학습 → TTS → 발음 평가)
- 엣지 케이스 테스트: max turns, expired sessions, invalid input
- 서버 기동 검증: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Alembic fresh DB 마이그레이션 검증
- OpenAPI 문서 완성 (/docs)
- Dockerfile 빌드 검증
- 버그 수정
- **최종 테스트: 179개 전체 통과 (0 failures)**

---

## 전체 API 엔드포인트
```
GET    /health
GET    /api/v1/user/me
GET    /api/v1/diary                        # cursor pagination
GET    /api/v1/diary/{id}                   # learning_cards 포함
PUT    /api/v1/diary/{id}
DELETE /api/v1/diary/{id}                   # soft delete
POST   /api/v1/diary/{id}/complete
POST   /api/v1/conversation                 # 세션 생성 + AI 첫 질문
GET    /api/v1/conversation/{session_id}    # 세션 상태/기록
WS     /ws/conversation/{session_id}        # 실시간 대화
POST   /api/v1/speech/tts                   # TTS 생성 (캐싱)
POST   /api/v1/speech/evaluate              # 발음 평가
```

## 테스트 추이
| Sprint | 테스트 수 | 누적 |
|--------|----------|------|
| S1 | 18 | 18 |
| S2 | +28 | 46 |
| S3 | +27 | 73 |
| S4 | +59 | 132 |
| S5 | +26 | 158 |
| S6 | +21 | 179 |
