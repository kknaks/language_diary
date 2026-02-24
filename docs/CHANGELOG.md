# Language Diary — CHANGELOG

## 2026-02-23: STT 기술 스택 변경 — Google STT → ElevenLabs STT

STT와 TTS를 ElevenLabs로 통일. 기술 스택을 OpenAI (번역/대화/학습포인트) + ElevenLabs (STT/TTS) + Azure Speech (발음 평가만)으로 정리.

### PRD.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **기술 스택** | STT: Google Speech-to-Text → ElevenLabs STT로 교체. STT+TTS를 ElevenLabs로 통일 |
| **사용자 플로우** | Google STT 호출 → ElevenLabs STT 호출로 변경 |
| **프론트-백 합의** | STT 항목: Google STT Streaming API → ElevenLabs STT로 변경 |
| **리스크** | STT 스트리밍 지연 대응: Google STT → ElevenLabs STT로 변경 |
| **환경변수** | GOOGLE_STT_CREDENTIALS 제거 |

---

## 2026-02-23: PRD v4 — 핵심 컨셉 변경: AI 대화형 일기 생성

"혼자 일기 말하기/타이핑" → "AI와 대화하면서 일기 만들기"로 핵심 컨셉 전면 변경.
유저가 직접 일기를 쓰는 대신, AI가 하루에 대해 질문하고 대화를 종합하여 일기를 자동 생성하는 구조.

### PRD.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **개요/컨셉** | 일기 입력 방식을 "직접 작성" → "AI 대화형 자동 생성"으로 전면 변경 |
| **기능 재정의** | F1: 모국어 일기 입력 → AI 대화형 일기 생성. F2: 실시간 음성 입력(스트리밍 STT) |
| **기술 스택** | STT: 일반 API → Google STT Streaming API. WebSocket 통신 추가 |
| **섹션 6 신설** | AI 대화 엔진 — 대화 플로우, 프롬프트 전략, 세션 상태, 턴 제한 |
| **사용자 플로우** | 전면 재작성 — WebSocket 기반 대화 세션 → 일기 자동 생성 → 학습 |
| **화면 구조** | "일기 작성" → "AI 대화 화면 (채팅 UI)" + "일기 확인/수정 화면" 분리 |
| **API 설계** | `POST /api/v1/conversation` (세션 생성), `WS /ws/conversation/{session_id}` (대화 진행) 추가. 기존 `POST /diary`, `POST /diary/{id}/translate` 제거. WebSocket 메시지 프로토콜 정의 |
| **에러 코드** | SESSION_NOT_FOUND, SESSION_EXPIRED, SESSION_ALREADY_COMPLETED 추가 |
| **프론트-백 합의** | WebSocket 기반 양방향 통신, 음성 스트리밍 포맷, 재연결 전략 추가 |
| **리스크** | STT 스트리밍 지연, WebSocket 연결 불안정, AI 대화 품질 리스크 추가 |
| **마일스톤** | 5단계 → 6단계, 6주 → 8주. M2: WebSocket + AI 대화 엔진 (2주), M3: 실시간 STT (1주) 신설 |
| **Phase 2** | F17: AI 대화 스타일 설정 추가 |

### DB_MODEL.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **conversation_sessions** | 신규 테이블 — AI 대화 세션 관리 (id, user_id, diary_id, status, turn_count) |
| **conversation_messages** | 신규 테이블 — 대화 메시지 기록 (session_id, role, content, message_order) |
| **diaries** | status에서 `translating`/`failed` 제거 (일기 생성은 대화 완료 시 한번에 처리) |
| **ERD** | conversation_sessions → conversation_messages, conversation_sessions → diaries 관계 추가 |
| **인덱스** | conversation_sessions, conversation_messages 인덱스 추가 |

---

## 2026-02-23: PRD v3 — JWT 인증을 Phase 2로 이동

MVP 단순화를 위해 인증(JWT)을 Phase 2로 이동. MVP는 하드코딩 유저 1명(user_id=1)으로 동작.

### PRD.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **인증** | MVP에서 JWT 인증 제거 → Phase 2로 이동. MVP는 user_id=1 하드코딩 |
| **기능 번호** | F1 회원가입/로그인 삭제, F2~F8 → F1~F7로 재번호. Phase 2에 F8(회원가입/로그인), F9(소셜 로그인) 추가 |
| **섹션 5** | 인증 플로우 → MVP 하드코딩 설명 + Phase 2 JWT 계획으로 변경 |
| **사용자 플로우** | 인증 단계 제거 → 앱 실행 시 바로 홈 |
| **화면 구조** | 로그인/회원가입 화면 제거 |
| **API** | auth 엔드포인트 3개 Phase 2 주석 처리. Authorization 헤더 불필요 |
| **마일스톤** | M1에서 인증 제거 (1.5주→1주), M2에서 JWT 제거. 총 6.5주→6주 |
| **MVP 제외** | 인증(JWT, 회원가입/로그인) 명시 추가 |

### DB_MODEL.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **users** | email, password_hash를 NULLABLE로 변경 + Phase 2 주석 표시 |
| **시드 데이터** | MVP 하드코딩 유저 INSERT문 추가 |

## 2026-02-23: STT 기술 스택 변경 — Google Speech-to-Text 통일

### PRD.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **기술 스택** | STT: 디바이스 네이티브 STT → Google Speech-to-Text API (서버사이드 호출)로 변경 |
| **사용자 플로우** | 클라이언트 직접 STT → 음성 녹음 후 서버 전송 → Google STT 호출 방식으로 변경 |
| **API 설계** | `POST /api/v1/speech/stt` 엔드포인트 추가 |
| **프론트-백 합의** | STT 합의사항: 클라이언트 직접 호출 → 서버 경유 Google STT로 변경 |
| **리스크** | STT 정확도 대응: 디바이스 네이티브 → Google STT (한국어 모델 지원)로 변경 |
| **마일스톤** | M1에 Google STT 연동 명시 |
| **Whisper** | Phase 2 Whisper API 검토 언급 제거 |

---

## 2026-02-23: PRD v2 & DB 모델 v2 (리뷰 반영)

기획자/백엔드/프론트엔드 3개 리뷰 종합 반영.

### PRD.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **인증** | JWT 기반 회원가입/로그인 플로우 추가 (섹션 5 신설). auth API 3개 추가 |
| **기술 스택** | 표 형태로 정리. STT → 디바이스 네이티브(MVP), TTS → ElevenLabs(fallback: OpenAI TTS)로 통일 |
| **기능 번호** | F1~F8(MVP), F9~F16(Phase 2)로 재정리. 중복 번호(F10) 수정 |
| **신규 MVP 기능** | F1 인증, F2 키보드 입력 추가, F7 일기 수정/삭제 추가 |
| **API 설계** | `/api/v1/` 버전 prefix 적용. 에러 응답 포맷/코드 표 추가. 페이지네이션 명세. 주요 응답 JSON 예시 추가 |
| **프론트-백 합의** | 오디오 포맷(WAV 16kHz mono), 날짜(UTC ISO8601), 번역 대기 전략 등 합의 사항 섹션 신설 |
| **UI/UX** | 로딩/에러/빈 상태, 마이크 권한 요청, 텍스트 길이 카운터, 학습 완료 애니메이션 등 명시 |
| **일기 정책** | 최대 1000자, 음성 3분, 하루 여러 개 가능 명시 |
| **마일스톤** | 4.5주 → 6.5주로 조정 (M1 1.5주, M3 2주, M4 1주, M5 1주) |
| **리스크** | TTS 캐싱, Circuit Breaker, 오디오 상태 머신 등 구체적 대응 추가 |

### DB_MODEL.md 변경사항

| 영역 | 변경 내용 |
|------|----------|
| **users** | `email` (UNIQUE), `password_hash`, `is_active`, `updated_at` 컬럼 추가 |
| **diaries** | `updated_at`, `deleted_at`(소프트 삭제) 추가. status에 `translating`/`failed` 추가 + CHECK 제약조건 |
| **learning_cards** | `card_type`: `full` → `sentence`로 변경 및 용도 명시. content 컬럼 TEXT로 확장. `cefr_level` CHECK 제약조건 추가 |
| **pronunciation_results** | 점수 컬럼 FLOAT → NUMERIC(5,2). `attempt_number` 컬럼 추가 |
| **tts_cache** | 신규 테이블 (text_hash, audio_url, voice_id, duration_ms) |
| **인덱스** | 복합 인덱스 `(user_id, created_at DESC)` 추가. 소프트 삭제 부분 인덱스 추가. TTS 캐시 인덱스 추가 |
