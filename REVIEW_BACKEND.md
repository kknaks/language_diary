# Language Diary — 백엔드 리뷰

> 리뷰 날짜: 2026-02-23
> 리뷰어: Backend Agent

---

## 1. API 설계 개선점

### 1.1 인증/인가 완전 부재
- PRD에 로그인/회원가입 관련 내용이 없음. MVP라도 **JWT 기반 인증**은 필수
- `users` 테이블에 `email`, `password_hash` 컬럼 필요
- 모든 API에 `Authorization: Bearer <token>` 헤더 필수
- 소셜 로그인(Apple/Google) Phase 2 고려 시 OAuth 구조 미리 설계

### 1.2 에러 핸들링 표준화
- API 응답 포맷 미정의. 아래와 같은 통일된 에러 응답 필요:
```json
{
  "error": {
    "code": "DIARY_NOT_FOUND",
    "message": "일기를 찾을 수 없습니다.",
    "status": 404
  }
}
```
- 외부 API(OpenAI, Azure 등) 실패 시 클라이언트에게 어떤 응답을 줄지 정의 필요
- Rate limit 초과, 토큰 한도 초과 등 에러 코드 사전 정의

### 1.3 페이지네이션
- `GET /api/diary` 목록 API에 페이지네이션 없음
- 커서 기반 권장: `?cursor={last_id}&limit=20`
- 응답에 `has_next`, `next_cursor` 포함

### 1.4 API 설계 보완
| 현재 | 문제 | 제안 |
|------|------|------|
| `POST /api/diary` → 저장+번역+학습포인트 한번에 | 하나의 API가 너무 많은 일을 함. 외부 API 실패 시 일기 자체가 저장 안 됨 | 저장과 번역을 분리 (PRD 플로우에는 분리되어 있으나 API 목록에는 혼재) |
| `POST /api/speech/stt` | STT는 스트리밍이 핵심인데 REST로는 실시간 처리 불가 | WebSocket 또는 클라이언트 직접 호출 고려 |
| `POST /api/diary/{id}/translate` | OK, 하지만 이미 번역된 일기 재번역 방지 로직 필요 | `status` 체크 + 멱등성 보장 |
| 학습 완료 API | PRD 플로우에 `POST /api/diary/{id}/complete` 있지만 API 목록에 없음 | 추가 필요 |
| 일기 수정/삭제 | API 없음 | `PUT /api/diary/{id}`, `DELETE /api/diary/{id}` 추가 |

### 1.5 API 버저닝
- `/api/v1/diary` 형태로 버전 prefix 권장
- 향후 다국어 확장 시 breaking change 대비

---

## 2. DB 모델 개선점

### 2.1 users 테이블
- **인증 컬럼 부재**: `email` (UNIQUE), `password_hash`, `auth_provider` 추가
- `updated_at` 컬럼 추가 (모든 테이블에 공통)
- `is_active` / `deleted_at` 소프트 딜리트 고려

### 2.2 diaries 테이블
- `status`가 VARCHAR인데 **ENUM 또는 CHECK 제약조건** 필요:
  ```sql
  CHECK (status IN ('draft', 'translating', 'translated', 'completed', 'failed'))
  ```
- `translating`, `failed` 상태 추가 — 번역 중 / 실패 상태 추적
- `updated_at` 컬럼 추가
- **복합 인덱스** 추가: `(user_id, created_at DESC)` — 사용자별 최신 일기 조회가 주 패턴
- 오늘 일기 중복 방지: `UNIQUE(user_id, DATE(created_at))` 또는 앱 레벨 체크

### 2.3 learning_cards 테이블
- `card_type`에 `'full'` 타입의 용도가 PRD에 없음 — 전체 번역문 발음용이라면 명시 필요
- `cefr_level`에 CHECK 제약조건 추가:
  ```sql
  CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'))
  ```
- Phase 2 복습 기능 대비: `mastered` (boolean), `review_count` 컬럼 고려
- `content_en`이 VARCHAR(500)이면 긴 구문은 잘릴 수 있음 — TEXT 검토

### 2.4 pronunciation_results 테이블
- `audio_url`에 실제 파일 저장 전략 미정의: S3? 로컬? 보존 기간?
- `user_id`는 `card → diary → user`로 추적 가능하므로 **비정규화**임. 쿼리 편의상 유지하되 인지 필요
- 점수 컬럼들 `FLOAT` → `NUMERIC(5,2)` 권장 (정밀도 보장)
- 한 카드에 여러 번 시도 가능 → 최고 점수 / 최근 점수 조회 쿼리 필요

### 2.5 누락 테이블
- **tts_cache**: 같은 텍스트 반복 TTS 호출 방지
  ```
  id | text_hash | text | audio_url | voice_id | created_at
  ```
- **api_usage_log**: 외부 API 비용 추적
  ```
  id | user_id | api_type | tokens_used | cost | created_at
  ```

---

## 3. 외부 API 연동 주의사항

### 3.1 Google STT
- **스트리밍 vs REST**: PRD 플로우는 실시간 스트리밍인데, 백엔드를 거치면 지연 발생
- **권장**: RN에서 직접 Google STT 호출 → 확정된 텍스트만 백엔드로 전송
- 비용: 스트리밍은 15초 단위 과금, 일기 길이 제한(예: 3분) 설정 권장

### 3.2 OpenAI API
- **프롬프트 버전 관리**: 번역/학습포인트 추출 프롬프트를 코드에 하드코딩하지 말고 설정 파일 또는 DB 관리
- **JSON 응답 강제**: `response_format: { type: "json_object" }` 사용, 파싱 실패 대비 재시도 로직
- **토큰 제한**: 일기 길이에 따른 토큰 사용량 예측 + 제한 (예: 원문 1000자 제한)
- **타임아웃**: OpenAI 응답이 느릴 수 있음 (10~30초). 클라이언트에 로딩 상태 필요
- **비동기 처리 고려**: 번역+학습포인트 생성을 백그라운드 태스크로 처리하고, 폴링 또는 WebSocket으로 완료 알림

### 3.3 ElevenLabs TTS
- **캐싱 필수**: 같은 텍스트는 한 번만 생성하고 저장 (위 tts_cache 테이블)
- **비용 주의**: 캐릭터 기반 과금. 월 한도 설정 + 사용자당 일일 한도
- **음성 파일 포맷**: mp3 vs wav → RN 재생 호환성 확인 필요

### 3.4 Azure Speech SDK (발음 평가)
- **SDK vs REST**: 발음 평가는 REST API로도 가능. 서버 사이드에서 SDK 직접 사용 시 리소스 관리 주의
- **오디오 포맷**: 클라이언트에서 보내는 음성의 샘플레이트/포맷 통일 필요 (16kHz, 16-bit, mono PCM 권장)
- **평가 세분화**: Azure는 음소(phoneme) 단위 점수도 제공 — feedback에 어떤 수준까지 저장할지 결정

### 3.5 공통
- **Circuit Breaker 패턴**: 외부 API 장애 시 즉시 실패 + 사용자 안내
- **Retry with Backoff**: 일시적 오류에 대한 재시도 (최대 3회)
- **API Key 관리**: 환경변수 + Secret Manager, 절대 코드에 하드코딩 금지
- **Fallback**: STT → Whisper API / TTS → OpenAI TTS 등 대체 서비스 준비

---

## 4. 성능/확장성 고려사항

### 4.1 응답 시간
- 일기 → 번역 → 학습포인트 파이프라인이 **10~30초** 걸릴 수 있음
- **방안 A**: 비동기 처리 (Celery/ARQ) + 상태 폴링
- **방안 B**: SSE (Server-Sent Events)로 단계별 진행 상태 스트리밍
- **방안 C**: MVP에서는 동기 + 로딩 UI로 시작, 추후 전환

### 4.2 파일 스토리지
- TTS 음성 파일 + 사용자 녹음 파일 → **오브젝트 스토리지** (MinIO 또는 S3)
- 개인 서버 배포라면 MinIO 권장
- 파일 정리 정책: 녹음 파일 30일 보존 후 삭제, TTS 캐시는 영구 보존

### 4.3 동시성
- 한 사용자가 번역 요청 중 중복 요청 방지 (디바운싱 + 서버 사이드 락)
- FastAPI의 async 활용: 외부 API 호출은 모두 `httpx.AsyncClient` 사용

### 4.4 DB 성능
- 현재 스케일에서는 문제없지만, Phase 2 통계 대시보드 시 **집계 테이블** 또는 materialized view 고려
- `pronunciation_results`는 빠르게 커질 수 있음 — 파티셔닝 또는 아카이빙 전략

### 4.5 배포
- Docker Compose: FastAPI + PostgreSQL + MinIO + Redis(큐용)
- Health check 엔드포인트: `GET /health`
- 환경별 설정 분리: `.env.dev`, `.env.prod`

---

## 5. 프론트엔드 팀 요청사항

### 5.1 API 계약 (Contract)
- **OpenAPI (Swagger) 명세 필수**: FastAPI 자동 생성 활용, `/docs` 엔드포인트 공유
- 요청/응답 스키마를 **Pydantic 모델로 엄격히** 정의
- 변경 시 반드시 사전 공유 + 버전 bump

### 5.2 데이터 포맷 합의 필요
```jsonc
// POST /api/v1/diary 응답 예시 — 프론트와 합의 필요
{
  "id": 1,
  "original_text": "오늘 회사에서 회의했어",
  "translated_text": "I had a meeting at work today.",
  "status": "translated",
  "learning_cards": [
    {
      "id": 1,
      "card_type": "word",
      "content_en": "meeting",
      "content_ko": "회의",
      "part_of_speech": "noun",
      "cefr_level": "A2",
      "example_en": "I had a meeting at work.",
      "example_ko": "회사에서 회의가 있었어.",
      "card_order": 1
    }
  ],
  "created_at": "2026-02-23T12:00:00Z"  // ISO 8601, UTC
}
```

### 5.3 프론트에 요청할 사항
1. **STT는 클라이언트에서 직접 호출** — 백엔드 프록시 불필요, API 키는 앱 빌드 시 주입
2. **오디오 녹음 포맷 통일**: 16kHz, 16-bit, mono, WAV 또는 FLAC
3. **날짜/시간은 UTC로 전송**, 타임존 변환은 클라이언트에서 처리
4. **번역 요청 시 로딩 UI 필수**: 최소 10초 대기 가능, 진행 상태 표시 권장
5. **중복 요청 방지**: 버튼 디바운싱 + disabled 상태 처리
6. **에러 핸들링**: 네트워크 오류, 서버 오류, 외부 API 오류별 사용자 메시지 분기
7. **파일 업로드 크기 제한**: 녹음 파일 최대 10MB, 서버에서도 검증하지만 클라이언트에서 선제 차단

### 5.4 우선 합의 항목
- [ ] API 응답 공통 포맷 (성공/에러)
- [ ] 인증 방식 (JWT 토큰 관리 플로우)
- [ ] 학습 카드 데이터 구조 확정
- [ ] 발음 평가 요청/응답 포맷
- [ ] TTS 오디오 전달 방식 (URL vs Base64 vs 스트리밍)

---

## 요약: 우선순위별 액션 아이템

| 우선순위 | 항목 | 비고 |
|---------|------|------|
| 🔴 P0 | 인증 체계 설계 + users 테이블 확장 | MVP에도 필수 |
| 🔴 P0 | API 응답 포맷 표준화 + OpenAPI 명세 | 프론트와 첫 합의 사항 |
| 🔴 P0 | 에러 핸들링 전략 (외부 API 실패 포함) | 사용자 경험 직결 |
| 🟡 P1 | STT 아키텍처 결정 (클라이언트 직접 vs 프록시) | 성능에 큰 영향 |
| 🟡 P1 | TTS 캐싱 구현 | 비용 절감 |
| 🟡 P1 | 비동기 처리 전략 (번역 파이프라인) | UX 개선 |
| 🟢 P2 | 페이지네이션 | 일기 수가 적을 때는 급하지 않음 |
| 🟢 P2 | API 사용량 추적 | 비용 모니터링 |
| 🟢 P2 | 파일 스토리지 전략 | MVP는 로컬 저장 가능 |
