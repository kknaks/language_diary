# Language Diary — 스프린트 계획

> PRD 마일스톤(M1~M6, 총 8주) 기반 1주 단위 스프린트 계획

---

## 스프린트 개요

| 스프린트 | 기간 | 마일스톤 | 핵심 목표 |
|----------|------|----------|-----------|
| Sprint 1 | 1주차 | M1 | 프로젝트 셋업 + 홈/채팅 UI 뼈대 + 백엔드 기초 |
| Sprint 2 | 2주차 | M2-1 | AI 대화 엔진 (백엔드) + 채팅 UI WebSocket 연동 |
| Sprint 3 | 3주차 | M2-2 | 일기 자동 생성 + 일기 확인/수정 화면 |
| Sprint 4 | 4주차 | M3 | 실시간 STT 스트리밍 연동 + 채팅 UI 완성 |
| Sprint 5 | 5주차 | M4-1 | TTS + 학습 화면 기본 구조 |
| Sprint 6 | 6주차 | M4-2 | 따라 말하기 + 발음 평가 |
| Sprint 7 | 7주차 | M5 | 히스토리 + 일기 수정/삭제 + UI 폴리싱 |
| Sprint 8 | 8주차 | M6 | 테스트 + Docker Compose 배포 + 버그 수정 |

---

## Sprint 1 — 프로젝트 셋업 + 기본 UI/서버 뼈대

### 백엔드
- [ ] FastAPI 프로젝트 구조 생성 (라우터, 서비스, 모델 분리)
- [ ] PostgreSQL + SQLAlchemy/Alembic 셋업, 마이그레이션 스크립트
- [ ] 전체 테이블 DDL 적용 (users, diaries, conversation_sessions 등)
- [ ] MVP 시드 데이터 (user_id=1)
- [ ] `GET /health` 헬스체크 엔드포인트
- [ ] Docker Compose 기본 구성 (FastAPI + PostgreSQL)
- [ ] 공통 에러 핸들링, 응답 포맷 설정

### 프론트엔드
- [ ] Expo + React Native 프로젝트 초기화
- [ ] 네비게이션 구조 설정 (탭: 홈, 히스토리)
- [ ] 홈 화면 UI (일기 작성 CTA 버튼 + 빈 상태)
- [ ] 채팅 화면 기본 레이아웃 (채팅 버블, 입력 영역 뼈대)
- [ ] API 클라이언트 설정 (axios/fetch wrapper, baseURL)

### 의존 관계
```
🟢 백엔드/프론트엔드 완전 독립 — 병렬 작업 가능
프론트: Mock 데이터로 UI 개발
```

### Done Criteria
- ✅ `docker-compose up`으로 FastAPI + PostgreSQL 기동, `/health` 200 응답
- ✅ DB 마이그레이션 성공, 모든 테이블 생성 확인
- ✅ Expo 앱 실행, 홈 화면 → 채팅 화면 네비게이션 동작
- ✅ API 클라이언트가 백엔드 `/health`에 연결 가능

### 시작 전 합의 사항
- [ ] 프로젝트 폴더 구조 (모노레포 vs 분리)
- [ ] 코딩 컨벤션 (린팅/포매팅 룰)
- [ ] Git 브랜치 전략 (feature/xxx → main)
- [ ] 환경변수 관리 방식 (.env)
- [ ] API baseURL 및 포트 확정

---

## Sprint 2 — AI 대화 엔진 + WebSocket 기본 연동

### 백엔드
- [ ] `POST /api/v1/conversation` — 대화 세션 생성 + AI 첫 질문 반환
- [ ] `GET /api/v1/conversation/{session_id}` — 세션 상태 조회
- [ ] `WS /ws/conversation/{session_id}` — WebSocket 기본 연결
- [ ] WebSocket 메시지 처리: `message` 타입 수신 → OpenAI 호출 → `ai_message` 응답
- [ ] OpenAI 대화 엔진 구현 (시스템 프롬프트, 맥락 유지, 턴 카운트)
- [ ] 세션 상태 관리 (created → active → summarizing → completed/expired)
- [ ] conversation_messages 테이블에 메시지 저장

### 프론트엔드
- [ ] 채팅 UI 완성 (메시지 버블, 스크롤, 턴 표시)
- [ ] `POST /api/v1/conversation` 호출 → AI 첫 질문 표시
- [ ] WebSocket 연결 및 메시지 송수신 (텍스트 입력만, 음성은 Sprint 4)
- [ ] 키보드 텍스트 입력 → WebSocket `message` 전송
- [ ] AI 응답 수신 → 채팅 버블에 표시
- [ ] [완료] 버튼 → WebSocket `finish` 전송
- [ ] 대화 진행 표시 (턴 카운터)
- [ ] WebSocket 재연결 로직 (지수 백오프, 최대 3회)

### 의존 관계
```
⚠️ 프론트 WebSocket 연동은 백엔드 WebSocket 엔드포인트 완성 필요
타임라인: 백엔드 WebSocket 기본 구현 (월~수) → 프론트 연동 (수~금)
초반에 프론트는 Mock WebSocket으로 UI 개발 가능
```

### Done Criteria
- ✅ 대화 세션 생성 → AI 첫 질문 수신
- ✅ 텍스트 입력으로 AI와 3턴 이상 대화 가능
- ✅ 대화 히스토리가 DB에 저장됨
- ✅ [완료] 버튼 클릭 시 세션 상태가 `summarizing`으로 전환

### 시작 전 합의 사항
- [ ] OpenAI 모델 선택 (gpt-4o / gpt-4o-mini) 및 API 키 셋업
- [ ] AI 시스템 프롬프트 초안 리뷰
- [ ] WebSocket 메시지 프로토콜 최종 확인 (PRD 10.6절 기준)
- [ ] 세션 타임아웃 정책 확인 (30분)

---

## Sprint 3 — 일기 자동 생성 + 일기 확인/수정 화면

### 백엔드
- [ ] `finish` 수신 시 대화 내용 종합 → OpenAI로 일기 생성 (한국어 원문 + 영어 번역)
- [ ] 학습 포인트 자동 추출 (단어/구문) → learning_cards 저장
- [ ] WebSocket `diary_created` 이벤트 전송 (일기 + learning_cards)
- [ ] `GET /api/v1/diary/{id}` — 일기 상세 (학습 카드 포함)
- [ ] `PUT /api/v1/diary/{id}` — 일기 수정
- [ ] 일기 생성 프롬프트 튜닝 (자연스러운 일기체, CEFR 태깅)

### 프론트엔드
- [ ] 대화 완료 후 로딩 화면 ("일기를 만들고 있어요...")
- [ ] `diary_created` 이벤트 수신 → 일기 확인 화면으로 이동
- [ ] 일기 확인 화면 (한국어 원문 + 영어 번역 표시)
- [ ] 일기 수정 기능 (텍스트 에디팅 → PUT 호출)
- [ ] [학습 시작] 버튼 UI

### 의존 관계
```
⚠️ 프론트 일기 확인 화면은 백엔드 diary_created 이벤트 & GET /diary/{id} 필요
타임라인: 백엔드 일기 생성 (월~수) → 프론트 연동 (수~금)
프론트 초반: Mock 일기 데이터로 UI 개발
```

### Done Criteria
- ✅ 대화 완료 → 영어 일기 + 한국어 원문 자동 생성
- ✅ learning_cards (단어 3개+, 구문 2개+) 자동 추출/저장
- ✅ 일기 확인 화면에서 한국어/영어 일기 표시
- ✅ 일기 텍스트 수정 후 저장 → DB 반영 확인
- ✅ 전체 플로우: 대화 → 일기 생성 → 확인 End-to-End 동작

### 시작 전 합의 사항
- [ ] 일기 생성 프롬프트 & 학습 포인트 추출 프롬프트 리뷰
- [ ] learning_cards 추출 개수 기준 (단어 몇 개, 구문 몇 개)
- [ ] 일기 확인 화면 디자인/레이아웃 합의

---

## Sprint 4 — 실시간 STT 스트리밍 + 채팅 UI 음성 입력

### 백엔드
- [ ] WebSocket에서 바이너리 프레임(음성 데이터) 수신 처리
- [ ] `audio_start`/`audio_end` 신호 처리
- [ ] Google STT Streaming API 연동 (16kHz 16-bit mono PCM)
- [ ] STT 중간 결과(`stt_interim`) + 최종 결과(`stt_final`) WebSocket 전송
- [ ] STT 최종 결과 → 자동으로 AI 대화 엔진에 전달 → `ai_message` 응답
- [ ] STT 실패 시 에러 메시지 전송 (`STT_FAILED`)

### 프론트엔드
- [ ] 마이크 권한 요청 바텀시트 (최초 사용 시)
- [ ] 마이크 버튼 UI (누르고 말하기)
- [ ] 음성 녹음 → WebSocket 바이너리 프레임 스트리밍
- [ ] STT 중간 결과 실시간 표시 (파형 애니메이션 + interim 텍스트)
- [ ] STT 최종 결과 → 채팅 버블에 확정 표시
- [ ] 키보드/음성 입력 모드 전환 버튼
- [ ] 오디오 상태 머신 (녹음 중에 다른 오디오 작업 방지)

### 의존 관계
```
⚠️ 음성 스트리밍 → STT 결과 수신은 백엔드 STT 파이프라인 완성 필요
타임라인: 백엔드 STT 연동 (월~수) → 프론트 음성 스트리밍 연동 (수~금)
프론트 초반: 마이크 UI + 로컬 녹음 테스트 선행 가능
```

### Done Criteria
- ✅ 마이크 버튼 → 음성 입력 → 실시간 STT 텍스트 표시
- ✅ STT 중간 결과가 실시간으로 업데이트됨
- ✅ 음성 입력으로 AI와 완전한 대화 가능 (음성 → STT → AI → 응답)
- ✅ 텍스트/음성 입력 모드 전환 정상 동작
- ✅ 마이크 권한 거부 시 텍스트 입력 폴백

### 시작 전 합의 사항
- [ ] Google STT API 키/프로젝트 셋업
- [ ] 오디오 스트리밍 포맷 확인 (16kHz 16-bit mono PCM)
- [ ] React Native 오디오 녹음 라이브러리 선택 (expo-av 등)
- [ ] STT interim 결과 UI 표시 방식 합의

---

## Sprint 5 — TTS + 학습 화면 기본 구조

### 백엔드
- [ ] `POST /api/v1/speech/tts` — ElevenLabs TTS 호출 + audio_url 반환
- [ ] TTS 캐싱 로직 (text_hash 기반, tts_cache 테이블)
- [ ] TTS Fallback (ElevenLabs 실패 시 OpenAI TTS)
- [ ] `GET /api/v1/diary/{id}` 응답에 learning_cards 포함 확인

### 프론트엔드
- [ ] 학습 화면 구조 (영어 번역문 전체 표시 + 카드 스와이프)
- [ ] 학습 포인트 카드 UI (영어 + 한국어 뜻 + 예문 + CEFR 태그)
- [ ] [발음 듣기] 버튼 → TTS API 호출 → 오디오 재생
- [ ] TTS 로딩 스피너
- [ ] 카드 스와이프 네비게이션 (이전/다음)

### 의존 관계
```
⚠️ 프론트 TTS 재생은 백엔드 /speech/tts 엔드포인트 필요
타임라인: 백엔드 TTS (월~화) → 프론트 연동 (화~)
프론트: 학습 카드 UI는 Mock 데이터로 선행 개발 가능
```

### Done Criteria
- ✅ 학습 화면에서 카드 스와이프로 단어/구문 탐색
- ✅ [발음 듣기] → 영어 발음 오디오 재생
- ✅ TTS 캐싱 동작 (동일 텍스트 재요청 시 캐시 히트)
- ✅ 일기 확인 → [학습 시작] → 학습 화면 전체 플로우 동작

### 시작 전 합의 사항
- [ ] ElevenLabs API 키 + voice_id 선택
- [ ] 학습 카드 디자인/레이아웃 합의
- [ ] 카드 순서 정책 (단어 먼저? 구문 먼저? 난이도순?)

---

## Sprint 6 — 따라 말하기 + 발음 평가

### 백엔드
- [ ] `POST /api/v1/speech/evaluate` — Azure Speech SDK 발음 평가 호출
- [ ] 오디오 파일 업로드 처리 (WAV 16kHz 16-bit mono, 최대 10MB)
- [ ] 발음 평가 결과 파싱 (accuracy, fluency, completeness, overall, word_scores)
- [ ] pronunciation_results 테이블에 결과 저장
- [ ] `POST /api/v1/diary/{id}/complete` — 학습 완료 기록

### 프론트엔드
- [ ] [따라 말하기] 녹음 버튼 UI (녹음 시작/중지)
- [ ] 녹음 → WAV 파일 → API 업로드
- [ ] 발음 점수 표시 (overall + 세부 점수)
- [ ] 단어별 점수/에러 표시
- [ ] 학습 완료 화면 (축하 애니메이션 + 요약: 단어 N개, 구문 N개, 평균 점수)
- [ ] 오디오 상태 머신 통합 (TTS 재생 ↔ 녹음 충돌 방지)

### 의존 관계
```
⚠️ 발음 평가는 백엔드 /speech/evaluate 완성 필요
타임라인: 백엔드 Azure 연동 (월~수) → 프론트 연동 (수~금)
프론트: 녹음 UI + 점수 표시 UI는 Mock으로 선행 가능
```

### Done Criteria
- ✅ [따라 말하기] → 녹음 → 발음 점수 수신/표시
- ✅ 단어별 점수 및 피드백 표시
- ✅ pronunciation_results DB 저장 확인
- ✅ 학습 완료 → 요약 화면 표시 + diary status `completed` 전환
- ✅ 전체 플로우: 대화 → 일기 → 학습(TTS+발음) → 완료 E2E 동작

### 시작 전 합의 사항
- [ ] Azure Speech SDK API 키/리전 셋업
- [ ] 발음 점수 표시 디자인 합의 (점수 바, 색상 코드 등)
- [ ] 학습 완료 조건 (모든 카드 1회 이상? 선택적?)

---

## Sprint 7 — 히스토리 + 수정/삭제 + UI 폴리싱

### 백엔드
- [ ] `GET /api/v1/diary` — 일기 목록 (커서 기반 페이지네이션)
- [ ] `DELETE /api/v1/diary/{id}` — 소프트 삭제 (deleted_at 설정)
- [ ] 목록 API에서 deleted_at IS NULL 필터링 확인
- [ ] 전체 API 에러 핸들링 점검 (에러 코드 일관성)
- [ ] API 응답 속도 최적화 (쿼리 튜닝)

### 프론트엔드
- [ ] 히스토리 탭 UI (날짜별 일기 목록, 무한 스크롤)
- [ ] 일기 상세 화면 (한국어 + 영어 + 대화 기록 + 학습 포인트)
- [ ] 일기 삭제 기능 (스와이프 또는 메뉴)
- [ ] 빈 상태 UI (홈, 히스토리)
- [ ] Skeleton 로딩 UI
- [ ] 네트워크 오프라인 배너
- [ ] WebSocket 연결 상태 표시
- [ ] 에러 상태 UI (API 실패, 타임아웃 등)
- [ ] 전반적 UI 폴리싱 (간격, 폰트, 색상, 애니메이션)

### 의존 관계
```
⚠️ 히스토리 목록/삭제는 백엔드 GET /diary, DELETE /diary/{id} 필요
타임라인: 백엔드 API (월~화) → 프론트 연동 (화~)
UI 폴리싱은 독립 작업
```

### Done Criteria
- ✅ 히스토리 탭에서 과거 일기 무한 스크롤 조회
- ✅ 일기 상세에서 대화 기록 + 학습 포인트 확인
- ✅ 일기 삭제 → 목록에서 제거 (소프트 삭제)
- ✅ 빈 상태, 로딩, 에러 상태 모두 적절히 표시
- ✅ 오프라인 배너 동작

### 시작 전 합의 사항
- [ ] 페이지네이션 limit 기본값 확정 (20?)
- [ ] 히스토리 날짜 그룹핑 방식 (일별? 주별?)
- [ ] 삭제 확인 UI (Alert? 바텀시트?)

---

## Sprint 8 — 테스트 + 배포 + 버그 수정

### 백엔드
- [ ] API 단위 테스트 (pytest) — 주요 엔드포인트
- [ ] WebSocket 통합 테스트
- [ ] 외부 API Mock 테스트 (OpenAI, Google STT, ElevenLabs, Azure)
- [ ] Docker Compose 배포 구성 최종화 (FastAPI + PostgreSQL + Redis)
- [ ] 환경변수 정리 (.env.production)
- [ ] 로깅 설정 (구조화된 로깅)
- [ ] CORS 설정 확인

### 프론트엔드
- [ ] 전체 플로우 수동 테스트 (대화 → 일기 → 학습 → 히스토리)
- [ ] 엣지 케이스 테스트 (네트워크 끊김, 세션 만료, 긴 대화 등)
- [ ] 디바이스별 테스트 (iOS/Android, 다양한 화면 크기)
- [ ] 성능 최적화 (불필요한 리렌더 제거, 메모리 누수 점검)
- [ ] 앱 아이콘/스플래시 스크린 설정
- [ ] EAS Build 또는 개발 빌드 최종 확인

### 의존 관계
```
🟢 백엔드/프론트엔드 대부분 독립 — 병렬 작업 가능
통합 테스트는 양쪽 모두 안정화 후 진행
```

### Done Criteria
- ✅ 전체 E2E 플로우 3회 이상 성공적 완주
- ✅ 주요 API 테스트 커버리지 확보
- ✅ Docker Compose로 프로덕션 환경 기동 성공
- ✅ 크리티컬 버그 0건
- ✅ iOS/Android 양 플랫폼에서 정상 동작 확인

### 시작 전 합의 사항
- [ ] 배포 서버 사양 및 접속 정보 확인
- [ ] 도메인/SSL 설정 (있는 경우)
- [ ] 테스트 시나리오 목록 작성
- [ ] 버그 우선순위 기준 합의 (P0: 블로커, P1: 주요, P2: 마이너)

---

## 전체 의존 관계 맵

```
Sprint 1 (셋업)
  ├─ BE: 서버+DB 뼈대 ─────────────────────────────────────┐
  └─ FE: 앱+UI 뼈대 ──────────────────────────────────────┐│
                                                            ││
Sprint 2 (대화 엔진)                                        ││
  ├─ BE: WebSocket + OpenAI ◄───── Sprint 1 BE 완료 필요 ──┘│
  └─ FE: 채팅 연동 ◄──────── Sprint 1 FE + Sprint 2 BE(WS) ┘
                                                            
Sprint 3 (일기 생성)                                        
  ├─ BE: 일기 생성 ◄──────── Sprint 2 BE (대화 엔진)        
  └─ FE: 일기 화면 ◄──────── Sprint 2 FE + Sprint 3 BE     
                                                            
Sprint 4 (STT)                                              
  ├─ BE: STT 파이프라인 ◄─── Sprint 2 BE (WebSocket)       
  └─ FE: 음성 입력 ◄──────── Sprint 2 FE + Sprint 4 BE     
                                                            
Sprint 5 (TTS)                                              
  ├─ BE: TTS + 캐싱 ◄────── Sprint 3 BE (learning_cards)   
  └─ FE: 학습 화면 ◄──────── Sprint 3 FE + Sprint 5 BE     
                                                            
Sprint 6 (발음 평가)                                        
  ├─ BE: Azure 연동 ◄────── Sprint 5 BE                    
  └─ FE: 따라 말하기 ◄────── Sprint 5 FE + Sprint 6 BE     
                                                            
Sprint 7 (히스토리/폴리싱)                                  
  ├─ BE: 목록/삭제 API ◄──── Sprint 3 BE (diary CRUD)      
  └─ FE: 히스토리+폴리싱 ◄── 모든 이전 FE 스프린트          
                                                            
Sprint 8 (테스트/배포)                                      
  └─ BE+FE: 전체 안정화 ◄── 모든 이전 스프린트              
```

---

## 기술 부채 & 향후 고려

- Phase 2 인증(JWT) 전환을 위해 미들웨어 구조를 미리 설계 (user_id 주입 레이어)
- TTS 캐시 만료 정책 (Phase 2)
- 외부 API Circuit Breaker 패턴 (Phase 2에서 강화)
- 모니터링/알림 (Phase 2)
