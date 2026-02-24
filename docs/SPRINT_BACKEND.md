# Language Diary — 백엔드 스프린트 계획

## 스프린트 개요

| 스프린트 | 기간 | 핵심 목표 |
|----------|------|-----------|
| Sprint 1 | 1주 | 프로젝트 셋업 + DB + 기본 CRUD API |
| Sprint 2 | 2주 | AI 대화 엔진 (WebSocket + OpenAI) + 일기 자동 생성 |
| Sprint 3 | 1주 | 실시간 STT 연동 (Google Speech-to-Text) |
| Sprint 4 | 2주 | TTS + 발음 평가 (ElevenLabs + Azure Speech) |
| Sprint 5 | 1주 | 히스토리/수정/삭제 + 에러 처리 + 배포 |
| Sprint 6 | 1주 | 테스트 + 버그 수정 + 최적화 |

---

## Sprint 1: 프로젝트 셋업 + DB + 기본 CRUD (1주)

### 구현 항목

| # | 항목 | 난이도 | 소요 |
|---|------|--------|------|
| 1-1 | FastAPI 프로젝트 구조 셋업 (라우터/서비스/리포지토리 레이어) | 하 | 2h |
| 1-2 | Docker Compose (FastAPI + PostgreSQL + Redis) | 하 | 2h |
| 1-3 | SQLAlchemy 모델 정의 (전체 7 테이블) + Alembic 마이그레이션 | 중 | 4h |
| 1-4 | MVP 시드 데이터 (user_id=1) | 하 | 0.5h |
| 1-5 | 공통 에러 핸들러 + 응답 포맷 | 하 | 2h |
| 1-6 | `GET /health` 헬스체크 | 하 | 0.5h |
| 1-7 | `GET /api/v1/diary` — 일기 목록 (커서 기반 페이지네이션) | 중 | 3h |
| 1-8 | `GET /api/v1/diary/{id}` — 일기 상세 (학습 카드 포함) | 하 | 2h |
| 1-9 | `PUT /api/v1/diary/{id}` — 일기 수정 | 하 | 1h |
| 1-10 | `DELETE /api/v1/diary/{id}` — 일기 소프트 삭제 | 하 | 1h |
| 1-11 | `POST /api/v1/diary/{id}/complete` — 학습 완료 기록 | 하 | 1h |
| 1-12 | OpenAPI(Swagger) 문서 자동 생성 확인 | 하 | 0.5h |

**소요 합계: ~19.5h (약 5일)**

### 리포지토리/서비스 구조
```
app/
├── main.py
├── config.py
├── database.py
├── models/          # SQLAlchemy 모델
│   ├── user.py
│   ├── diary.py
│   ├── conversation.py
│   ├── learning_card.py
│   ├── pronunciation.py
│   └── tts_cache.py
├── schemas/         # Pydantic 스키마
├── routers/         # API 라우터
│   ├── diary.py
│   ├── conversation.py
│   └── speech.py
├── services/        # 비즈니스 로직
│   ├── diary_service.py
│   ├── conversation_service.py
│   ├── ai_service.py
│   ├── stt_service.py
│   ├── tts_service.py
│   └── pronunciation_service.py
├── repositories/    # DB 접근
│   ├── diary_repo.py
│   ├── conversation_repo.py
│   ├── learning_card_repo.py
│   └── pronunciation_repo.py
└── utils/
    ├── errors.py
    └── audio.py
```

---

## Sprint 2: AI 대화 엔진 + 일기 생성 (2주)

### 구현 항목

| # | 항목 | 난이도 | 소요 |
|---|------|--------|------|
| 2-1 | `POST /api/v1/conversation` — 대화 세션 생성 + AI 첫 질문 반환 | 중 | 4h |
| 2-2 | `GET /api/v1/conversation/{session_id}` — 세션 상태/기록 조회 | 하 | 2h |
| 2-3 | WebSocket `/ws/conversation/{session_id}` — 기본 연결 + 텍스트 메시지 교환 | 상 | 8h |
| 2-4 | OpenAI 연동: AI 대화 서비스 (`ai_service.py`) | 중 | 6h |
| 2-5 | 시스템 프롬프트 설계 (친근한 대화 유도 + 후속 질문 생성) | 중 | 4h |
| 2-6 | 대화 맥락 관리 (conversation_messages 누적 → OpenAI 전달) | 중 | 3h |
| 2-7 | 대화 턴 카운트 + 최대 10턴 제한 | 하 | 1h |
| 2-8 | 대화 종료 처리 (`finish` 메시지 → `summarizing` 상태) | 중 | 2h |
| 2-9 | 일기 자동 생성: 대화 종합 → 한국어 원문 + 영어 번역 (OpenAI) | 상 | 6h |
| 2-10 | 학습 포인트 자동 추출: 단어 + 구문 + 예문 (OpenAI) | 상 | 6h |
| 2-11 | 세션 타임아웃 처리 (30분 무응답 → expired, 일기 자동 생성) | 중 | 3h |
| 2-12 | WebSocket 재연결 지원 (세션 상태 서버 보존) | 중 | 3h |
| 2-13 | conversation_repo + conversation_service 구현 | 중 | 4h |

**소요 합계: ~52h (약 10일)**

### 외부 API
- **OpenAI API**: 대화 엔진 + 일기 생성 + 학습 포인트 추출 (이 스프린트에서 최초 연동)

---

## Sprint 3: 실시간 STT 연동 (1주)

### 구현 항목

| # | 항목 | 난이도 | 소요 |
|---|------|--------|------|
| 3-1 | Google Speech-to-Text Streaming API 연동 (`stt_service.py`) | 상 | 8h |
| 3-2 | WebSocket에 음성 스트리밍 통합 (`audio_start`/binary/`audio_end`) | 상 | 6h |
| 3-3 | STT 중간 결과 (`stt_interim`) + 최종 결과 (`stt_final`) 실시간 전달 | 중 | 3h |
| 3-4 | 오디오 포맷 처리 (16kHz 16-bit mono PCM 검증) | 중 | 2h |
| 3-5 | STT 에러 핸들링 + 폴백 (녹음 후 일괄 전송) | 중 | 3h |
| 3-6 | STT → AI 응답 파이프라인 (음성 최종 결과 → OpenAI 후속 질문) | 중 | 2h |

**소요 합계: ~24h (약 5일)**

### 외부 API
- **Google Speech-to-Text**: Streaming API (WebSocket 경유)

---

## Sprint 4: TTS + 발음 평가 (2주)

### 구현 항목

| # | 항목 | 난이도 | 소요 |
|---|------|--------|------|
| 4-1 | `POST /api/v1/speech/tts` — TTS 생성 엔드포인트 | 중 | 3h |
| 4-2 | ElevenLabs TTS API 연동 (`tts_service.py`) | 중 | 4h |
| 4-3 | TTS 캐싱 (tts_cache 테이블 + text_hash 기반 중복 방지) | 중 | 3h |
| 4-4 | 오디오 파일 저장 (로컬 디스크, MP3) + 정적 파일 서빙 | 하 | 2h |
| 4-5 | TTS Fallback: OpenAI TTS (ElevenLabs 장애 시) | 중 | 3h |
| 4-6 | `POST /api/v1/speech/evaluate` — 발음 평가 엔드포인트 | 중 | 3h |
| 4-7 | Azure Speech SDK REST API 연동 (`pronunciation_service.py`) | 상 | 8h |
| 4-8 | 오디오 업로드 처리 (WAV 16kHz 16-bit mono, 최대 10MB) | 중 | 2h |
| 4-9 | 발음 점수 파싱 (accuracy/fluency/completeness/overall + word_scores) | 중 | 3h |
| 4-10 | pronunciation_results 저장 (attempt_number 관리) | 하 | 2h |
| 4-11 | Circuit Breaker + Retry (외부 API 공통) | 중 | 4h |

**소요 합계: ~37h (약 8일)**

### 외부 API
- **ElevenLabs**: TTS 생성
- **Azure Speech SDK**: 발음 평가 (REST API)

---

## Sprint 5: 히스토리 보완 + 에러 처리 + 배포 (1주)

### 구현 항목

| # | 항목 | 난이도 | 소요 |
|---|------|--------|------|
| 5-1 | 일기 상세 API 보강 (대화 기록 포함) | 하 | 2h |
| 5-2 | Rate Limiting (429 응답) | 중 | 2h |
| 5-3 | 로깅 구조화 (structured logging) | 하 | 2h |
| 5-4 | CORS 설정 | 하 | 0.5h |
| 5-5 | 환경 변수 관리 (.env + config.py) | 하 | 1h |
| 5-6 | Docker Compose 배포 최종화 (FastAPI + PostgreSQL + Redis) | 중 | 4h |
| 5-7 | Nginx 리버스 프록시 + WebSocket 프록시 설정 | 중 | 3h |
| 5-8 | DB 마이그레이션 스크립트 정리 | 하 | 1h |
| 5-9 | API 문서 최종 검수 (Swagger) | 하 | 1h |

**소요 합계: ~16.5h (약 4일)**

---

## Sprint 6: 테스트 + 버그 수정 (1주)

### 구현 항목

| # | 항목 | 난이도 | 소요 |
|---|------|--------|------|
| 6-1 | 단위 테스트: 서비스 레이어 (diary, conversation, ai) | 중 | 6h |
| 6-2 | 통합 테스트: API 엔드포인트 (pytest + httpx) | 중 | 6h |
| 6-3 | WebSocket 테스트 | 상 | 4h |
| 6-4 | 외부 API Mock 테스트 (OpenAI, Google STT, ElevenLabs, Azure) | 중 | 4h |
| 6-5 | 부하 테스트 (기본) | 중 | 2h |
| 6-6 | 버그 수정 + 엣지 케이스 처리 | - | 4h |

**소요 합계: ~26h (약 5일)**

---

## 프론트엔드 우선 제공 API (우선순위순)

프론트엔드가 화면 개발을 병렬로 진행할 수 있도록, 아래 순서로 API를 먼저 완성하여 제공합니다.

| 우선순위 | API | 스프린트 | 이유 |
|----------|-----|----------|------|
| 🥇 P0 | `GET /health` | Sprint 1 | 연결 확인 |
| 🥇 P0 | `POST /api/v1/conversation` | Sprint 2 (1주차) | 대화 화면 진입 필수 |
| 🥇 P0 | `WS /ws/conversation/{session_id}` (텍스트만) | Sprint 2 (1주차) | 채팅 UI 개발 핵심 |
| 🥈 P1 | `GET /api/v1/diary` | Sprint 1 | 홈 화면 목록 |
| 🥈 P1 | `GET /api/v1/diary/{id}` | Sprint 1 | 일기 상세 화면 |
| 🥈 P1 | `GET /api/v1/conversation/{session_id}` | Sprint 2 | 대화 기록 조회 |
| 🥉 P2 | `PUT /api/v1/diary/{id}` | Sprint 1 | 일기 수정 |
| 🥉 P2 | `DELETE /api/v1/diary/{id}` | Sprint 1 | 일기 삭제 |
| 🥉 P2 | `POST /api/v1/speech/tts` | Sprint 4 | 학습 화면 발음 듣기 |
| 🥉 P2 | `POST /api/v1/speech/evaluate` | Sprint 4 | 따라 말하기 |
| P3 | `POST /api/v1/diary/{id}/complete` | Sprint 1 | 학습 완료 기록 |

> **권장**: Sprint 1 완료 후 일기 CRUD API Mock 데이터와 함께 프론트에게 전달. Sprint 2 1주차에 WebSocket 기본 동작 확인 가능하도록 제공.

---

## 외부 API 연동 순서

```
Sprint 2 ──→ OpenAI API (대화 엔진 + 일기 생성 + 학습 포인트)
Sprint 3 ──→ Google Speech-to-Text (Streaming STT)
Sprint 4 ──→ ElevenLabs (TTS) → Azure Speech SDK (발음 평가)
```

| 순서 | 외부 API | 스프린트 | 용도 | 난이도 |
|------|----------|----------|------|--------|
| 1 | **OpenAI API** | Sprint 2 | 대화 AI + 일기 생성 + 번역 + 학습 포인트 추출 | 중 |
| 2 | **Google STT** | Sprint 3 | 실시간 음성→텍스트 (WebSocket 스트리밍) | 상 |
| 3 | **ElevenLabs** | Sprint 4 전반 | TTS 음성 합성 (+ OpenAI TTS 폴백) | 중 |
| 4 | **Azure Speech SDK** | Sprint 4 후반 | 발음 평가 (정확도/유창성/완성도) | 상 |

### 연동 이유 순서
1. **OpenAI 먼저**: 앱의 핵심 기능(대화→일기 생성)이 OpenAI에 의존. 이것 없이는 다른 기능 테스트 불가
2. **Google STT 다음**: 음성 입력이 대화 플로우의 주요 입력 방식. WebSocket에 통합 필요
3. **ElevenLabs 후**: 학습 화면에서 사용. 대화→일기 파이프라인 완성 후 구현
4. **Azure 마지막**: 발음 평가는 학습 플로우의 마지막 단계. TTS 이후 구현

---

## 전체 일정 요약

```
Week 1        : [Sprint 1] 프로젝트 셋업 + DB + 일기 CRUD ──→ 프론트에 일기 API 제공
Week 2-3      : [Sprint 2] AI 대화 엔진 + WebSocket + 일기 자동 생성 ──→ 프론트에 대화 API 제공
Week 4        : [Sprint 3] 실시간 STT 연동
Week 5-6      : [Sprint 4] TTS + 발음 평가 ──→ 프론트에 음성 API 제공
Week 7        : [Sprint 5] 에러 처리 + 배포
Week 8        : [Sprint 6] 테스트 + 버그 수정
```

**총 예상 소요: 8주 (1인 기준)**
