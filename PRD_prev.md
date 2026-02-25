# Language Diary — PRD (Product Requirements Document)

## 1. 개요
AI와 음성 대화를 통해 오늘 있었던 일을 자연스럽게 이야기하면, AI가 질문하고 맥락을 이어가며 대화를 종합해 영어 일기를 자동 생성하는 언어 학습 앱. 생성된 일기에서 핵심 단어/구문을 학습 포인트로 제공하고, TTS로 모범 발음을 들으며 학습한다. Phase 2에서 따라 말하기(발음 평가)를 추가한다.

### 핵심 컨셉: AI 대화형 일기 생성
유저가 혼자 일기를 쓰는 것이 아니라, AI가 오늘 하루에 대해 질문하면서 대화를 통해 자연스럽게 일기를 완성하는 구조.

```
AI: "오늘 하루 어땠어?"
유저: (음성) "회사에서 회의했어"
AI: "어떤 회의였어? 누구랑?"
유저: (음성) "팀장님이랑 프로젝트 일정 잡았어"
AI: "결과는 어땠어?"
유저: (음성) "다음주까지 마감이래 좀 빡세"
AI: → 대화를 종합해서 영어 일기 텍스트 자동 생성
```

## 2. 타겟 유저
- 영어를 배우려는 한국어 사용자
- 모바일 + 태블릿 사용자
- Phase 2에서 다국어 확장

## 3. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| **앱** | React Native (iOS + Android) | Expo 기반 |
| **백엔드** | Python FastAPI | 비동기 처리, WebSocket 지원 |
| **AI** | OpenAI API | 대화 엔진 + 일기 생성 + 번역 + 학습 포인트 |
| **DB** | PostgreSQL | |
| **STT** | ElevenLabs STT | WebSocket 경유 실시간 스트리밍. 한국어/영어 인식 |
| **TTS** | ElevenLabs API | 서버사이드 호출 + 캐싱. Fallback: OpenAI TTS |
| **발음 평가** | Azure Speech SDK (REST API) | 서버사이드 — **Phase 2** |
| **통신** | WebSocket | 대화 세션의 실시간 양방향 통신 |
| **파일 저장** | 로컬 디스크 (MVP) → MinIO/S3 (Phase 2) | |
| **인증** | 하드코딩 유저 (MVP: user_id=1) → JWT (Phase 2) | |
| **배포** | Docker Compose (개인 서버) | FastAPI + PostgreSQL + Redis |

## 4. 핵심 기능

### MVP (Phase 1 — 한국어 → 영어)

| # | 기능 | 설명 |
|---|------|------|
| F1 | AI 대화형 일기 생성 | AI가 하루에 대해 질문하고, 유저가 음성/텍스트로 답하며 대화. 대화 종료 시 AI가 종합하여 영어 일기 자동 생성 |
| F2 | 실시간 음성 입력 (STT) | WebSocket 기반 스트리밍 STT로 대화 중 실시간 음성→텍스트 변환. 키보드 입력도 지원 |
| F3 | 학습 포인트 | 생성된 영어 일기에서 중요 단어 + 회화용 구문 추출 및 해설 |
| F4 | 모범 발음 | TTS로 영어 번역문/구문 발음 재생 |
| F5 | 일기 수정/삭제 | 생성된 일기 수정 및 삭제 (소프트 삭제) |
| F6 | 일기 히스토리 | 날짜별 일기 + 학습 기록 보기 (커서 기반 페이지네이션) |

### Phase 2 (확장)

| # | 기능 | 설명 |
|---|------|------|
| F8 | 회원가입/로그인 | 이메일+비밀번호 기반 JWT 인증 (Access + Refresh Token) |
| F9 | 소셜 로그인 | Apple/Google OAuth |
| F10 | 복습 | 전날 학습 포인트 되짚기 |
| F11 | 다국어 확장 | 일본어, 중국어, 스페인어 등 |
| F12 | 레벨 테스트 | 초기 실력 진단 → 맞춤 난이도 |
| F13 | 통계 대시보드 | 학습 일수, 단어 수, 발음 점수 추이 |
| F14 | 소셜/공유 | 학습 기록 공유 |
| F15 | 오프라인 복습 | 다운로드된 학습 포인트 오프라인 복습 |
| F16 | 푸시 알림 | 매일 일기 작성 리마인더 |
| F17 | AI 대화 스타일 설정 | 질문 깊이, 톤(격식/친근) 등 커스터마이징 |
| F18 | 따라 말하기 (발음 평가) | 사용자 발음 녹음 + Azure Speech SDK 발음 평가(점수/피드백) |

## 5. 인증 (MVP: 하드코딩 유저)

### MVP
- 인증 없음. 모든 API는 **하드코딩된 user_id=1**로 동작
- 로그인/회원가입 화면 없음 → 앱 실행 시 바로 홈 화면
- `Authorization` 헤더 불필요

### Phase 2: JWT 인증
Phase 2에서 아래 인증 플로우를 구현:

- `POST /api/v1/auth/register` — 회원가입 (이메일+비밀번호)
- `POST /api/v1/auth/login` — 로그인 → JWT 토큰 쌍 반환
- `POST /api/v1/auth/refresh` — Access Token 갱신
- Access Token: 30분 만료, Refresh Token: 7일 만료
- 비밀번호: bcrypt 해싱
- 모든 API에 `Authorization: Bearer <access_token>` 헤더 필수

## 6. AI 대화 엔진

### 대화 플로우
1. **대화 시작**: 유저가 "일기 쓰기" 탭 → WebSocket 연결 → AI가 첫 질문 전송
2. **대화 진행**: AI가 유저 응답에 맞춰 후속 질문 (3~7턴)
3. **대화 종료**: 유저가 "완료" 버튼 또는 AI가 충분히 수집했다고 판단 시 종료
4. **일기 생성**: 대화 내용을 종합하여 한국어 원문 + 영어 번역 일기 자동 생성
5. **학습 포인트**: 영어 일기에서 단어/구문 추출

### AI 프롬프트 전략
- **시스템 프롬프트**: 친근한 친구처럼 하루에 대해 자연스럽게 질문하는 역할
- **맥락 유지**: 대화 히스토리를 누적하여 OpenAI에 전달 (이전 답변 참조)
- **질문 생성 규칙**:
  - 개방형 질문으로 시작 ("오늘 하루 어땠어?")
  - 유저 답변에 따라 구체적 후속 질문 ("어떤 회의였어?", "기분은 어땠어?")
  - 3턴 이상이면 자연스럽게 마무리 유도 가능
  - 최대 10턴까지 (비용 관리)
- **일기 생성 프롬프트**: 대화 전체를 입력으로, 자연스러운 일기체 영어 + 한국어 원문 동시 생성

### 대화 세션 상태
```
created → active → summarizing → completed
                 → expired (타임아웃 30분)
```

### 대화 턴 제한
- 최소: 2턴 (유저 응답 최소 2개)
- 권장: 3~7턴
- 최대: 10턴
- 타임아웃: 30분 무응답 시 자동 종료 (현재까지 대화로 일기 생성)

## 7. 학습 포인트 정책

### 구문 추출
생성된 영어 일기에서 두 가지를 모두 추출:
- **회화 표현** — 실생활에서 자주 쓰는 표현 (예: "grab lunch with", "end up ~ing")
- **문법 패턴** — 핵심 영어 구조 (예: "I used to ~", "I'm about to ~")

각 구문에 포함할 정보:
- 영어 구문
- 한국어 뜻
- 예문 (일기 문맥 활용)
- 난이도 (CEFR 기준)

### 단어 추출
- **CEFR 등급별 빈도 기반** (A1~C2)
- 고빈도 단어 우선 추출
- MVP: 사용자 레벨 없이 전체 추출 → 난이도 태그만 표시
- Phase 2: 레벨 테스트 결과에 따라 사용자 수준 대비 학습 가치 높은 단어 우선 추천

각 단어에 포함할 정보:
- 영어 단어
- 한국어 뜻
- 품사
- CEFR 등급 (A1~C2)
- 예문 (일기 문맥 활용)

### 하루 일기 정책
- 하루 여러 개 작성 가능 (제한 없음)

### CEFR 레벨 체계
| 레벨 | 설명 |
|------|------|
| A1 | 입문 — 기초 인사, 자기소개 |
| A2 | 초급 — 일상 대화, 간단한 설명 |
| B1 | 중급 — 여행, 업무 기본 소통 |
| B2 | 중상급 — 자유로운 대화, 의견 표현 |
| C1 | 고급 — 복잡한 주제, 유창한 표현 |
| C2 | 최고급 — 원어민 수준 |

## 8. 사용자 플로우 (MVP)

### 전체 흐름

```
유저                    프론트 (React Native)              백엔드 (FastAPI)                외부 API
─────────────────────────────────────────────────────────────────────────────────────────────────────

[1] AI 대화로 일기 만들기
│
├─ [일기 쓰기] 탭       ─→ POST /api/v1/conversation       ─→ 대화 세션 생성
│                       ←─ { session_id, first_message }    ←─ AI 첫 질문 ("오늘 하루 어땠어?")
│
├─ AI 질문 표시 (채팅 UI)
│
├─ 마이크 탭 or 키보드   ─→ WebSocket /ws/conversation/{session_id}
│  한국어로 대답         ─→ 음성 스트리밍 → 실시간 STT      ─→ ElevenLabs STT
│                       ←─ STT 결과 (중간/최종)             ←─
│                       ─→ 유저 메시지 전송                  ─→ OpenAI (맥락 유지 + 후속 질문)
│                       ←─ AI 후속 질문 수신                 ←─
│
├─ (3~7턴 반복)
│
├─ [완료] 탭            ─→ WebSocket: { type: "finish" }
│  또는 AI 자동 마무리   ─→ 대화 종합 → 일기 생성            ─→ OpenAI (일기 생성 + 번역 + 학습포인트)
│                       ←─ 일기 + 학습 포인트 수신           ←─
│
├─ 생성된 일기 확인/수정
│

[2] 학습
│
├─ 영어 일기 확인
│
├─ 학습 포인트 카드 넘기기
│  │
│  ├─ [발음 듣기] 탭    ─→ POST /api/v1/speech/tts ───────→ ElevenLabs TTS
│  │                    ←─ 음성 재생 (audio_url)            ←─ (캐싱됨)
│  │
│  └─ 다음 카드 →
│
[3] 완료
│
├─ 학습 완료 화면
│  (오늘 학습 요약: 단어 N개, 구문 N개)
│
└─ 홈으로
```

## 9. 화면 구조 (MVP)

```
1. 홈 (앱 시작 화면 — MVP: 로그인 없이 바로 진입)
   - 오늘의 일기 작성 버튼 ("AI와 대화하기")
   - 최근 일기 목록 (Skeleton 로딩)
   - 빈 상태: "AI와 대화하며 첫 일기를 만들어보세요" CTA + 일러스트

2. AI 대화 화면 (채팅 UI)
   - 채팅 버블 UI (AI 질문 = 좌측, 유저 응답 = 우측)
   - 하단 입력 영역:
     - 마이크 버튼 (누르고 말하기 → 실시간 STT → 텍스트 표시)
     - 키보드 입력 전환 버튼
     - 전송 버튼
   - STT 진행 중: 파형 애니메이션 + 실시간 텍스트 표시 (interim results)
   - 대화 진행 표시: "3/10턴" 등
   - [완료] 버튼 (상단 또는 하단)
   - 일기 생성 중: 로딩 표시 ("일기를 만들고 있어요...")

3. 일기 확인/수정 화면
   - 생성된 한국어 원문 + 영어 번역
   - 수정 가능 (텍스트 에디팅)
   - [학습 시작] 버튼

4. 학습 화면
   - 영어 번역문 (전체)
   - 학습 포인트 카드 (단어/구문별, 스와이프)
     - 영어 + 한국어 뜻
     - 예문
     - [발음 듣기] TTS 버튼 (로딩 스피너)
     - ~~[따라 말하기] → Phase 2~~
   - 학습 완료: 축하 애니메이션 + 요약

5. 히스토리
   - 날짜별 일기 목록 (커서 기반 무한 스크롤)
   - 일기 상세 (한국어 + 영어 + 대화 기록 + 학습 포인트)
   - 빈 상태: 아직 일기 없음 안내
   - 일기 삭제 (스와이프 또는 메뉴)

6. 전역 상태
   - 네트워크 오프라인 배너
   - WebSocket 연결 상태 표시
   - 세션 만료 시 로그인 리다이렉트 (Phase 2)
   - 마이크 권한 요청 바텀시트 (최초 사용 시)
```

## 10. API 설계

### 10.1 공통 규칙
- API prefix: `/api/v1/`
- 인증: MVP에서는 인증 없음 (user_id=1 하드코딩). Phase 2에서 JWT 도입
- 날짜/시간: **ISO 8601, UTC** (예: `2026-02-23T12:00:00Z`)
- 오디오 포맷: **WAV 16kHz 16-bit mono** (녹음 업로드), **MP3** (TTS 응답)
- 파일 업로드: 최대 **10MB**
- OpenAPI(Swagger) 명세 자동 생성 (`/docs`)

### 10.2 성공 응답 포맷
```jsonc
{
  "id": 1,
  "original_text": "오늘 회사에서 회의했어...",
  "translated_text": "I had a meeting at work today...",
  "status": "completed",
  "created_at": "2026-02-23T12:00:00Z"
}
```

### 10.3 에러 응답 포맷
```jsonc
{
  "error": {
    "code": "DIARY_NOT_FOUND",
    "message": "일기를 찾을 수 없습니다.",
    "detail": "diary_id=999"
  }
}
```

### 10.4 에러 코드
| 코드 | HTTP | 설명 |
|------|------|------|
| `VALIDATION_ERROR` | 400 | 요청 데이터 검증 실패 |
| `UNAUTHORIZED` | 401 | 인증 실패 / 토큰 만료 (Phase 2) |
| `DIARY_NOT_FOUND` | 404 | 일기 없음 |
| `SESSION_NOT_FOUND` | 404 | 대화 세션 없음 |
| `SESSION_EXPIRED` | 410 | 대화 세션 만료 |
| `SESSION_ALREADY_COMPLETED` | 409 | 이미 완료된 세션 |
| `TRANSLATION_FAILED` | 502 | OpenAI 번역 실패 |
| `STT_FAILED` | 502 | 음성 인식 실패 |
| `TTS_FAILED` | 502 | TTS 생성 실패 |
| `EVALUATION_FAILED` | 502 | 발음 평가 실패 |
| `RATE_LIMITED` | 429 | 요청 한도 초과 |

### 10.5 엔드포인트

```
# 인증 (Phase 2)
# POST   /api/v1/auth/register     — 회원가입
# POST   /api/v1/auth/login        — 로그인
# POST   /api/v1/auth/refresh      — 토큰 갱신

# 대화 세션
POST   /api/v1/conversation              — 대화 세션 생성 → AI 첫 질문 반환
GET    /api/v1/conversation/{session_id}  — 대화 세션 상태/기록 조회

# WebSocket
WS     /ws/conversation/{session_id}      — 대화 진행 (음성 스트리밍 + 메시지 교환)

# 일기
GET    /api/v1/diary               — 일기 목록 (?cursor={id}&limit=20)
GET    /api/v1/diary/{id}          — 일기 상세 (학습 카드 포함)
PUT    /api/v1/diary/{id}          — 일기 수정 (생성된 일기 텍스트 수정)
DELETE /api/v1/diary/{id}          — 일기 삭제 (소프트 삭제)
POST   /api/v1/diary/{id}/complete — 학습 완료 기록

# 음성
POST   /api/v1/speech/tts          — TTS 생성 (캐싱됨)
POST   /api/v1/speech/evaluate     — 발음 평가

# 시스템
GET    /health                     — 헬스체크
```

### 10.6 WebSocket 메시지 프로토콜

#### 클라이언트 → 서버
```jsonc
// 텍스트 메시지 전송
{ "type": "message", "text": "회사에서 회의했어" }

// 음성 데이터 스트리밍 (binary frame)
// 바이너리 프레임으로 오디오 청크 전송

// 음성 입력 시작/종료 신호
{ "type": "audio_start" }
{ "type": "audio_end" }

// 대화 종료 요청
{ "type": "finish" }
```

#### 서버 → 클라이언트
```jsonc
// STT 중간 결과 (실시간)
{ "type": "stt_interim", "text": "회사에서 회의..." }

// STT 최종 결과
{ "type": "stt_final", "text": "회사에서 회의했어" }

// AI 응답 (후속 질문)
{ "type": "ai_message", "text": "어떤 회의였어? 누구랑 했어?" }

// 대화 종료 + 일기 생성 결과
{
  "type": "diary_created",
  "diary": {
    "id": 1,
    "original_text": "오늘 회사에서 팀장님과 프로젝트 일정 회의를 했다...",
    "translated_text": "I had a project scheduling meeting with my team leader at work today...",
    "status": "translated"
  },
  "learning_cards": [ ... ]
}

// 에러
{ "type": "error", "code": "STT_FAILED", "message": "음성 인식에 실패했습니다." }
```

### 10.7 페이지네이션 (일기 목록)
```jsonc
// GET /api/v1/diary?cursor=50&limit=20
{
  "items": [ ... ],
  "next_cursor": 30,
  "has_next": true
}
```

### 10.8 주요 응답 예시

**POST /api/v1/conversation 응답:**
```jsonc
{
  "session_id": "conv_abc123",
  "status": "active",
  "first_message": "오늘 하루 어땠어? 😊",
  "created_at": "2026-02-23T12:00:00Z"
}
```

**POST /api/v1/speech/evaluate 응답:**
```jsonc
{
  "overall_score": 85,
  "accuracy_score": 88,
  "fluency_score": 82,
  "completeness_score": 85,
  "feedback": "Good pronunciation overall. Pay attention to the 't' sound in 'meeting'.",
  "word_scores": [
    { "word": "meeting", "score": 72, "error_type": "Mispronunciation" }
  ]
}
```

## 11. 프론트-백엔드 합의 사항

| 항목 | 합의 |
|------|------|
| 대화 통신 | WebSocket 기반 양방향. 세션 ID로 연결 관리 |
| STT | WebSocket으로 음성 스트리밍 → 서버에서 ElevenLabs STT 호출 → 중간/최종 결과 실시간 반환 |
| TTS 응답 | 서버에서 audio_url 반환 (MP3), 캐싱됨 |
| 오디오 업로드 포맷 | WAV 16kHz 16-bit mono (발음 평가용), 최대 10MB |
| 음성 스트리밍 포맷 | WebSocket binary frame, 16kHz 16-bit mono PCM |
| 날짜/시간 | UTC (ISO 8601), 타임존 변환은 클라이언트 |
| 일기 생성 대기 | 대화 완료 후 일기 생성 5~15초. WebSocket으로 결과 push |
| 중복 요청 방지 | 클라이언트 버튼 디바운싱 + disabled 상태 |
| WebSocket 재연결 | 연결 끊김 시 자동 재연결 (최대 3회). 세션 상태 서버 보존 |

## 12. MVP 제외 사항
- 인증 (JWT, 회원가입/로그인) → Phase 2
- 복습 기능
- 레벨 테스트
- 다국어 (영어 외)
- 통계 대시보드
- 소셜 공유
- 오프라인 모드
- 소셜 로그인 (Apple/Google)
- 푸시 알림
- 다크모드 (Phase 2 우선 검토)
- AI 대화 스타일 커스터마이징

## 13. 리스크 & 대응

| 리스크 | 대응 |
|--------|------|
| STT 스트리밍 지연 | ElevenLabs STT 사용 (중간 결과 실시간 표시). 폴백: 녹음 후 일괄 전송 |
| WebSocket 연결 불안정 | 자동 재연결 (지수 백오프, 최대 3회) + 세션 상태 서버 보존 + 텍스트 입력 폴백 |
| AI 대화 품질 | 프롬프트 엔지니어링 반복 개선 + 대화 턴 제한 (최대 10턴) |
| OpenAI API 비용 | 대화 턴 제한 (최대 10턴) + 프롬프트 토큰 최적화 |
| 발음 평가 정확도 | Azure Speech SDK REST API 사용 |
| TTS 비용 | ElevenLabs 캐싱 (tts_cache 테이블) + 사용자당 일일 한도 검토 |
| 외부 API 장애 | Circuit Breaker + Retry with Backoff (최대 3회) + 사용자 안내 |
| 오디오 세션 충돌 | 오디오 상태 머신 (한 번에 하나의 작업만 활성화) |

## 14. 마일스톤

| 단계 | 내용 | 예상 기간 |
|------|------|-----------|
| M1 | RN 프로젝트 셋업 + 홈 화면 + 채팅 UI 기본 구조 (인증 없이 바로 진입) | 1주 |
| M2 | 백엔드: FastAPI + DB + WebSocket 셋업 + AI 대화 엔진 (OpenAI) + 일기 자동 생성 | 2주 |
| M3 | 실시간 STT 연동 (WebSocket 스트리밍) + 채팅 UI 완성 | 1주 |
| M4 | 학습 화면: TTS(캐싱) + 따라 말하기 + 발음 평가 | 2주 |
| M5 | 히스토리(페이지네이션) + 일기 수정/삭제 + UI 폴리싱 + 에러/빈/로딩 상태 | 1주 |
| M6 | 테스트 + Docker Compose 배포 + 버그 수정 | 1주 |
| **합계** | | **~8주** |

## 상태

- [x] 아이디어
- [x] 기획 (PRD)
- [x] 리뷰 반영 (v2)
- [x] 핵심 컨셉 변경 (v4 — AI 대화형 일기)
- [ ] 디자인
- [ ] 개발
- [ ] 테스트
- [ ] 배포
