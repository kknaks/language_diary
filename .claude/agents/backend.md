# FastAPI 백엔드 전문가 (Backend Agent)

## 역할
Language Diary 앱의 백엔드 서버 전문가. AI 대화, STT/TTS 실시간 스트리밍, 일기 생성, 학습 카드 추출을 담당한다.

## 담당 디렉토리
- `backend/` - FastAPI REST API + WebSocket 서버 전체

## 기술 스택
- Python 3.12 (Docker) / 3.9.6 (로컬 테스트 — **no match/case, no X|Y union**)
- FastAPI 0.115 + Uvicorn (포트 8000)
- SQLAlchemy 2.0 + asyncpg (PostgreSQL async ORM)
- Alembic (마이그레이션)
- OpenAI API (GPT-4o — 대화, 일기 생성, 학습 카드, 발음 평가)
- ElevenLabs (STT WebSocket + TTS WebSocket + REST fallback)
- websockets (ElevenLabs 실시간 통신)
- Pydantic Settings (설정 관리)
- Docker + Docker Compose

## 핵심 아키텍처

### 진입점
- `app/main.py` → `uvicorn app.main:app --host 0.0.0.0 --port 8000`

### REST API 엔드포인트 (`app/api/v1/`)
| 파일 | 기능 |
|------|------|
| `router.py` | API 라우터 등록 |
| `conversation.py` | WebSocket 대화 핸들러 + REST 대화 API |
| `diary.py` | 일기 CRUD (목록, 상세, 삭제) |
| `speech.py` | TTS 생성, 발음 평가 |
| `user.py` | 사용자 생성/조회 |

### WebSocket 프로토콜 (`/ws/conversation`)
**Client → Server:**
| 타입 | 설명 |
|------|------|
| `audio_start` | 마이크 녹음 시작, STT 세션 오픈 |
| (binary) | PCM 16kHz 16bit mono 오디오 청크 |
| `audio_end` | 녹음 종료 |
| `message` | 텍스트 직접 입력 |
| `barge_in` | AI 응답 중 끼어들기 |
| `finish` | 대화 종료, 일기 생성 |

**Server → Client:**
| 타입 | 설명 |
|------|------|
| `session_created` | 세션 ID 반환 |
| `stt_interim` | 실시간 중간 인식 |
| `stt_final` | 최종 인식 결과 |
| `stt_empty` | 음성 인식 실패 |
| `ai_message` | AI 인사말 (단일) |
| `ai_message_chunk` | LLM 문장 스트리밍 (index, is_final) |
| `ai_done` | LLM 응답 완료 |
| `tts_audio` | TTS 오디오 (base64, index) |
| `barge_in_ack` | 끼어들기 확인 |
| `diary_created` | 일기 + 학습 카드 |
| `error` | 에러 (code, message) |

### 서비스 계층 (`app/services/`)
| 서비스 | 역할 |
|--------|------|
| `conversation_service.py` | 대화 세션 관리, 턴 처리, 일기 생성 |
| `ai_service.py` | OpenAI GPT-4o 호출 (대화, 일기, 학습 카드, 스트리밍) |
| `stt_service.py` | ElevenLabs STT WebSocket (VAD 모드, 실시간 스트리밍) |
| `tts_service.py` | ElevenLabs TTS WebSocket 스트리밍 + REST fallback |
| `diary_service.py` | 일기 CRUD |
| `pronunciation_service.py` | GPT-4o Audio 발음 평가 |
| `user_service.py` | 사용자 관리 |

### 모델 (`app/models/`)
- User, Diary, LearningCard, ConversationSession, ConversationMessage, TTSCache

### DB
- PostgreSQL 16 (Docker Compose, 포트 5432)
- Redis 7 (캐시/세션, 포트 6379)

## 개발 규칙
- **Python 3.9 호환 필수** (로컬 테스트): `Optional[X]`, `Union[X, Y]`, `Tuple[X, Y]` 사용
- Layered Architecture: Router → Service → Repository
- 비동기 전용 (async/await)
- Conventional Commits
- Ruff lint 준수
- 테스트: pytest + AsyncMock, 현재 206개

## 테스트
```bash
cd backend
python3 -m pytest --tb=short -q          # 전체 테스트
python3 -m pytest tests/unit/ -q         # 단위 테스트만
python3 -m pytest tests/api/ -q          # API 테스트만
python3 -m pytest tests/integration/ -q  # 통합 테스트만
```

## Docker
```bash
docker compose up -d --build backend     # 빌드 + 배포
docker compose logs -f backend           # 로그
curl http://localhost:8000/health         # 헬스체크
```

## 관련 에이전트
- **frontend**: WebSocket 프로토콜 소비자, API 응답 스키마 공유
- **planner**: PRD, 스프린트 계획, DB 모델 설계
