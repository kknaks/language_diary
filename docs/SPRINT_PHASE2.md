# Phase 2 — 스크럼 계획서

> **상태**: 확정 대기  
> **작성일**: 2025-02-25  
> **기반 문서**: PRD (F8/F9/F10), API_DESIGN_BACKEND.md, API_DESIGN_FRONTEND.md  
> **스프린트 수**: 4개 (S1~S4)  
> **예상 총 작업일**: 12~14일 (에이전트 기준)

---

## 목차

1. [스프린트 개요](#스프린트-개요)
2. [S1: 기반 인프라](#s1-기반-인프라)
3. [S2: 소셜 로그인 + 온보딩](#s2-소셜-로그인--온보딩)
4. [S3: 홈/마이페이지 + 기존 API 인증 적용](#s3-홈마이페이지--기존-api-인증-적용)
5. [S4: 통합 테스트 + 배포](#s4-통합-테스트--배포)
6. [협의 필요 사항](#협의-필요-사항)
7. [신규 파일/디렉토리 구조](#신규-파일디렉토리-구조)
8. [예상 기간](#예상-기간)

---

## 스프린트 개요

```
S1 (기반 인프라)     S2 (로그인+온보딩)     S3 (홈/마이+인증적용)    S4 (테스트+배포)
┌──────────────┐   ┌──────────────┐     ┌──────────────────┐   ┌──────────────┐
│ DB 마이그레이션 │   │ Google/Apple  │     │ 4탭 구조 전환     │   │ E2E 테스트    │
│ JWT 미들웨어   │   │ 온보딩 4스텝   │     │ /home 통합 API   │   │ Docker 업데이트│
│ 프론트 토큰 인프라│   │ 프로필 생성 API │     │ 마이페이지 탭     │   │ TestFlight    │
│ 시드 데이터 API │   │ 프론트 로그인   │     │ 기존 API 인증 적용│   │ 문서 정리      │
└──────┬───────┘   └──────┬───────┘     └────────┬─────────┘   └──────────────┘
       │                   │                      │
       🔗 순차 ────────────🔗 순차 ───────────────🔗 순차
       (BE↔FE는 🔀 병렬)   (BE↔FE는 🔀 병렬)      (BE↔FE는 🔀 병렬)
```

---

## S1: 기반 인프라

### 목표
DB 스키마 확장, JWT 인증 백엔드 파이프라인, 프론트 토큰 저장/갱신 인프라를 구축하여 S2 이후 기능 개발의 기반을 마련한다.

### 완료 조건 (Definition of Done)

- [ ] `users`, `user_profiles`, `refresh_tokens`, `user_language_levels`, `languages`, `avatars`, `voices` 테이블 생성 완료
- [ ] 시드 데이터 (`languages`, `avatars`, `voices`) JSON → DB 적재 스크립트 동작
- [ ] `GET /api/v1/languages`, `GET /api/v1/avatars`, `GET /api/v1/voices` 정상 응답
- [ ] `get_current_user`, `get_onboarded_user` FastAPI 의존성 구현 + 단위 테스트
- [ ] Access Token (30분) / Refresh Token (30일) 발급/검증 로직 동작
- [ ] `POST /api/v1/auth/refresh` 토큰 로테이션 정상 동작
- [ ] 프론트: `expo-secure-store`에 토큰 저장/읽기/삭제 동작
- [ ] 프론트: API 호출 시 `Authorization: Bearer` 헤더 자동 추가
- [ ] 프론트: 401 응답 → 자동 갱신 → 재요청 인터셉터 동작

---

### 백엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| B1.1 | Alembic 마이그레이션: `users` 테이블 확장 (`social_provider`, `social_id`, `deleted_at` 추가) | `backend/alembic/versions/xxxx_add_phase2_users.py` | 🔀 |
| B1.2 | Alembic 마이그레이션: `user_profiles` 테이블 생성 | `backend/alembic/versions/xxxx_add_user_profiles.py` | 🔀 |
| B1.3 | Alembic 마이그레이션: `refresh_tokens` 테이블 생성 | `backend/alembic/versions/xxxx_add_refresh_tokens.py` | 🔀 |
| B1.4 | Alembic 마이그레이션: `user_language_levels` 테이블 생성 | `backend/alembic/versions/xxxx_add_user_language_levels.py` | 🔀 |
| B1.5 | Alembic 마이그레이션: 시드 테이블 (`languages`, `avatars`, `voices`) 생성 | `backend/alembic/versions/xxxx_add_seed_tables.py` | 🔀 |
| B1.6 | SQLAlchemy 모델 정의: `User` 확장, `UserProfile`, `RefreshToken`, `UserLanguageLevel` | `backend/app/models/user.py` (확장)<br>`backend/app/models/profile.py` (신규)<br>`backend/app/models/auth.py` (신규) | 🔀 |
| B1.7 | SQLAlchemy 모델 정의: `Language`, `Avatar`, `Voice` | `backend/app/models/seed.py` (신규) | 🔀 |
| B1.8 | 시드 데이터 JSON 파일 작성 | `backend/seeds/languages.json`<br>`backend/seeds/avatars.json`<br>`backend/seeds/voices.json` | 🔀 |
| B1.9 | 시드 데이터 적재 스크립트 (upsert) | `backend/app/scripts/seed_data.py` | 🔗 B1.7 후 |
| B1.10 | JWT 유틸리티: `create_access_token()`, `create_refresh_token()`, `verify_access_token()` | `backend/app/utils/jwt.py` (신규) | 🔀 |
| B1.11 | 인증 의존성: `get_current_user`, `get_onboarded_user` | `backend/app/dependencies.py` (확장) | 🔗 B1.10 후 |
| B1.12 | Refresh Token 리포지토리: `create()`, `find_by_hash()`, `delete()`, `delete_all_for_user()` | `backend/app/repositories/auth_repo.py` (신규) | 🔗 B1.6 후 |
| B1.13 | 인증 서비스: `refresh_token()` (토큰 로테이션) | `backend/app/services/auth_service.py` (신규) | 🔗 B1.10, B1.12 후 |
| B1.14 | 라우터: `POST /api/v1/auth/refresh` | `backend/app/api/v1/auth.py` (신규) | 🔗 B1.13 후 |
| B1.15 | 시드 데이터 API 라우터: `GET /languages`, `GET /avatars`, `GET /voices` | `backend/app/api/v1/seed.py` (신규) | 🔗 B1.7 후 |
| B1.16 | 시드 데이터 스키마: `LanguageResponse`, `AvatarResponse`, `VoiceResponse` | `backend/app/schemas/seed.py` (신규) | 🔀 |
| B1.17 | 인증 스키마: `SocialLoginRequest`, `TokenResponse`, `RefreshRequest` | `backend/app/schemas/auth.py` (신규) | 🔀 |
| B1.18 | 에러 코드 추가: Phase 2 에러 코드 상수 등록 | `backend/app/exceptions.py` (확장) | 🔀 |
| B1.19 | 라우터 등록: `auth`, `seed` 라우터를 `router.py`에 추가 | `backend/app/api/v1/router.py` (수정) | 🔗 B1.14, B1.15 후 |
| B1.20 | 단위 테스트: JWT 발급/검증, 토큰 갱신, 시드 API | `backend/tests/unit/test_jwt.py`<br>`backend/tests/unit/test_auth_service.py`<br>`backend/tests/unit/test_seed_api.py` | 🔗 마지막 |

---

### 프론트엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| F1.1 | `expo-secure-store` 설치 + 토큰 저장/읽기/삭제 유틸리티 | `frontend/src/utils/tokenManager.ts` (신규) | 🔀 |
| F1.2 | 인증 Zustand 스토어: `useAuthStore` (토큰 상태, isAuthenticated, isOnboarded) | `frontend/src/stores/useAuthStore.ts` (신규) | 🔀 |
| F1.3 | API 클라이언트 리팩토링: `Authorization` 헤더 자동 추가 | `frontend/src/services/api.ts` (수정) | 🔗 F1.1 후 |
| F1.4 | 401 인터셉터: 자동 갱신 + 재요청 + 동시 요청 큐 관리 | `frontend/src/services/api.ts` (수정) | 🔗 F1.3 후 |
| F1.5 | 인증 타입 정의: `User`, `AuthTokens`, `SocialLoginRequest`, `TokenResponse` | `frontend/src/types/auth.ts` (신규) | 🔀 |
| F1.6 | 시드 데이터 타입 정의: `Language`, `Avatar`, `Voice` | `frontend/src/types/seed.ts` (신규) | 🔀 |
| F1.7 | 앱 시작 시 인증 흐름: 토큰 확인 → 유효성 검사 → 라우팅 결정 | `frontend/app/_layout.tsx` (수정) | 🔗 F1.2, F1.4 후 |

---

### 의존성/협의 포인트

| 항목 | 내용 | 담당 |
|------|------|------|
| ⚠️ JWT Secret Key | `JWT_SECRET_KEY` 환경변수 설정 필요. `.env`에 추가 | BE |
| ⚠️ Alembic 설정 | Alembic이 아직 없으면 초기 설정 필요 (`alembic init`) | BE |
| 토큰 응답 형식 | `{ access_token, refresh_token, token_type, expires_in }` — BE/FE 동일 스키마 사용 | BE↔FE |
| 시드 데이터 공유 | `voices.json` 초기 데이터 (ElevenLabs voice_id 매핑) 확정 필요 | BE |

---

## S2: 소셜 로그인 + 온보딩

### 목표
Google/Apple 소셜 로그인을 구현하고, 신규 유저를 위한 4단계 온보딩(언어→아바타→목소리→성격) 플로우를 완성한다.

### 완료 조건 (Definition of Done)

- [ ] `POST /api/v1/auth/social` — Google id_token 검증 + JWT 발급 정상 동작
- [ ] `POST /api/v1/auth/social` — Apple id_token 검증 + JWT 발급 정상 동작
- [ ] 신규 유저 자동 생성 (`users` INSERT) + `onboarding_completed: false` 응답
- [ ] 기존 유저 로그인 시 `onboarding_completed: true/false` 정확히 반환
- [ ] `POST /api/v1/user/profile` — 온보딩 데이터 저장 + `onboarding_completed = true` 설정
- [ ] `GET /api/v1/user/profile` — 프로필 조회 (nested object 포함) 정상 동작
- [ ] 프론트: Google 로그인 → 토큰 수신 → 온보딩 여부 분기 동작
- [ ] 프론트: Apple 로그인 → 토큰 수신 → 온보딩 여부 분기 동작
- [ ] 프론트: 온보딩 Step 1~4 화면 완성 + 로컬 상태 관리
- [ ] 프론트: 온보딩 완료 → `POST /api/v1/user/profile` → 홈 탭 진입

---

### 백엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| B2.1 | Google id_token 검증 유틸리티 (`google-auth` 라이브러리) | `backend/app/utils/social_auth.py` (신규) | 🔀 |
| B2.2 | Apple id_token 검증 유틸리티 (Apple JWKS + `PyJWT`) | `backend/app/utils/social_auth.py` (확장) | 🔀 |
| B2.3 | 유저 리포지토리 확장: `find_by_social()`, `create_social_user()` | `backend/app/repositories/user_repo.py` (수정) | 🔗 S1 완료 후 |
| B2.4 | 인증 서비스: `social_login()` — 검증 + 유저 생성/조회 + JWT 발급 | `backend/app/services/auth_service.py` (확장) | 🔗 B2.1, B2.2, B2.3 후 |
| B2.5 | 라우터: `POST /api/v1/auth/social` | `backend/app/api/v1/auth.py` (확장) | 🔗 B2.4 후 |
| B2.6 | 프로필 리포지토리: `create_profile()`, `get_profile_with_relations()` | `backend/app/repositories/profile_repo.py` (신규) | 🔗 S1 완료 후 |
| B2.7 | 프로필 서비스: `create_profile()` — validation (성격 합계 100, voice-language 매칭) | `backend/app/services/profile_service.py` (신규) | 🔗 B2.6 후 |
| B2.8 | 프로필 서비스: `get_profile()` — nested object 조회 (language, avatar, voice JOIN) | `backend/app/services/profile_service.py` (확장) | 🔗 B2.6 후 |
| B2.9 | 라우터: `POST /api/v1/user/profile` (온보딩 완료) | `backend/app/api/v1/user.py` (수정) | 🔗 B2.7 후 |
| B2.10 | 라우터: `GET /api/v1/user/profile` (프로필 조회) | `backend/app/api/v1/user.py` (수정) | 🔗 B2.8 후 |
| B2.11 | 프로필 스키마: `ProfileCreateRequest`, `ProfileResponse` (nested) | `backend/app/schemas/user.py` (확장) | 🔀 |
| B2.12 | `POST /api/v1/auth/logout` 구현 | `backend/app/api/v1/auth.py` (확장) | 🔀 |
| B2.13 | `DELETE /api/v1/auth/account` 구현 (소프트 삭제) | `backend/app/api/v1/auth.py` (확장) | 🔀 |
| B2.14 | 단위 테스트: 소셜 로그인, 프로필 생성/조회, 성격 validation | `backend/tests/unit/test_social_auth.py`<br>`backend/tests/unit/test_profile_service.py` | 🔗 마지막 |

---

### 프론트엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| F2.1 | `expo-auth-session` (Google) + `expo-apple-authentication` (Apple) 설치 및 설정 | `frontend/package.json`<br>`frontend/app.config.ts` (수정) | 🔀 |
| F2.2 | 로그인 화면 UI: 앱 로고 + Google/Apple 버튼 + 이용약관 링크 | `frontend/app/login.tsx` (신규) | 🔀 |
| F2.3 | 인증 API 서비스: `socialLogin()`, `logout()`, `deleteAccount()` | `frontend/src/services/authApi.ts` (신규) | 🔀 |
| F2.4 | Google 로그인 플로우: id_token 획득 → `POST /auth/social` → 토큰 저장 | `frontend/app/login.tsx` (확장)<br>`frontend/src/services/authApi.ts` | 🔗 F2.2, F2.3 후 |
| F2.5 | Apple 로그인 플로우: id_token 획득 → `POST /auth/social` → 토큰 저장 | `frontend/app/login.tsx` (확장) | 🔗 F2.2, F2.3 후 |
| F2.6 | 온보딩 Step 1: 언어 선택 화면 (`GET /api/v1/languages`) | `frontend/app/onboarding/step1-language.tsx` (신규) | 🔀 |
| F2.7 | 온보딩 Step 2: 아바타 외형 선택 화면 (`GET /api/v1/avatars`) | `frontend/app/onboarding/step2-avatar.tsx` (신규) | 🔀 |
| F2.8 | 온보딩 Step 3: 목소리 선택 화면 (`GET /api/v1/voices?language_id=`) + 미리듣기 | `frontend/app/onboarding/step3-voice.tsx` (신규) | 🔀 |
| F2.9 | 온보딩 Step 4: 성격 설정 화면 (empathy/intuition/logic 슬라이더) | `frontend/app/onboarding/step4-personality.tsx` (신규) | 🔀 |
| F2.10 | 온보딩 레이아웃: 스텝 인디케이터 + 네비게이션 + 로컬 상태 관리 | `frontend/app/onboarding/_layout.tsx` (신규) | 🔗 F2.6~F2.9 후 |
| F2.11 | 온보딩 완료 처리: `POST /api/v1/user/profile` → 홈 탭 이동 | `frontend/app/onboarding/step4-personality.tsx` (확장) | 🔗 F2.10 후 |
| F2.12 | 프로필 Zustand 스토어: `useProfileStore` | `frontend/src/stores/useProfileStore.ts` (신규) | 🔀 |
| F2.13 | 온보딩 Zustand 스토어: `useOnboardingStore` (임시 데이터 관리) | `frontend/src/stores/useOnboardingStore.ts` (신규) | 🔀 |
| F2.14 | 인증 가드: `_layout.tsx`에서 로그인/온보딩 상태 기반 라우팅 | `frontend/app/_layout.tsx` (수정) | 🔗 F2.4, F2.11 후 |

---

### 의존성/협의 포인트

| 항목 | 내용 | 담당 |
|------|------|------|
| ⚠️ Google OAuth Client ID | iOS + Web 클라이언트 ID 발급 필요 (Google Cloud Console) | 인프라 |
| ⚠️ Apple Sign In 설정 | Apple Developer 계정에서 Service ID 등록 + 키 파일 생성 | 인프라 |
| `onboarding_completed` 위치 | 소셜 로그인 응답의 `user` 객체에 포함 확인 | BE→FE |
| 프로필 응답 nested | `GET /user/profile` 응답에 `avatar`, `voice`, `language` 객체 포함 | BE→FE |
| ⚠️ sample_url public 접근 | 목소리 미리듣기용 URL은 인증 없이 접근 가능해야 함 | BE |

---

## S3: 홈/마이페이지 + 기존 API 인증 적용

### 목표
4탭 구조(홈/일기쓰기/히스토리/마이페이지)로 전환하고, `/home` 통합 API를 구현하며, 기존 모든 API에 JWT 인증 + 소유권 검증을 적용한다.

### 완료 조건 (Definition of Done)

- [ ] `GET /api/v1/home` — 닉네임, 아바타, 최근 일기, 통계 통합 응답
- [ ] `PUT /api/v1/user/profile` — partial update 정상 동작
- [ ] `PUT /api/v1/user/language-level` — CEFR 레벨 변경 정상 동작
- [ ] 기존 모든 API에 `get_onboarded_user` 의존성 적용
- [ ] 서비스 레이어: `user_id=1` 하드코딩 → `current_user.id` 교체 완료
- [ ] 소유권 검증: 다른 유저의 diary/conversation 접근 시 403 반환
- [ ] WebSocket 인증: query param 방식 토큰 검증
- [ ] TTS: 유저 프로필 `voice_id` 자동 적용 (override 가능)
- [ ] `/api/v1/user/me` 엔드포인트 삭제 (→ `/user/profile`로 통합)
- [ ] 프론트: 4탭 레이아웃 동작
- [ ] 프론트: 홈 탭 개인화 (인사말 + 아바타 + 최근 일기)
- [ ] 프론트: 마이페이지 탭 (프로필 조회/수정 전체 기능)
- [ ] 프론트: WebSocket 연결 시 JWT 전달

---

### 백엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| B3.1 | 홈 API 서비스: 유저 프로필 + 아바타 + 최근 일기 + 통계 조합 | `backend/app/services/home_service.py` (신규) | 🔀 |
| B3.2 | 홈 API 라우터: `GET /api/v1/home` | `backend/app/api/v1/home.py` (신규) | 🔗 B3.1 후 |
| B3.3 | 홈 API 스키마: `HomeResponse` (user, avatar, recent_diaries, stats) | `backend/app/schemas/home.py` (신규) | 🔀 |
| B3.4 | 프로필 수정 서비스: `update_profile()` — partial update + validation | `backend/app/services/profile_service.py` (확장) | 🔀 |
| B3.5 | 프로필 수정 라우터: `PUT /api/v1/user/profile` | `backend/app/api/v1/user.py` (수정) | 🔗 B3.4 후 |
| B3.6 | 학습 레벨 API: `PUT /api/v1/user/language-level` | `backend/app/api/v1/user.py` (수정) | 🔀 |
| B3.7 | 학습 레벨 스키마: `LanguageLevelRequest`, `LanguageLevelResponse` | `backend/app/schemas/user.py` (확장) | 🔀 |
| B3.8 | 일기 API 인증 적용: `diary.py` 전체 엔드포인트에 `get_onboarded_user` 추가 | `backend/app/api/v1/diary.py` (수정) | 🔀 |
| B3.9 | 일기 서비스 파라미터화: `user_id` 파라미터 추가 + 소유권 검증 | `backend/app/services/diary_service.py` (수정)<br>`backend/app/repositories/diary_repo.py` (수정) | 🔗 B3.8 후 |
| B3.10 | 대화 API 인증 적용: `conversation.py`, `convai.py` 인증 추가 | `backend/app/api/v1/conversation.py` (수정)<br>`backend/app/api/v1/convai.py` (수정) | 🔀 |
| B3.11 | 대화 서비스 파라미터화: `user_id` 하드코딩 제거 + 소유권 검증 | `backend/app/services/conversation_service.py` (수정)<br>`backend/app/services/convai_service.py` (수정)<br>`backend/app/repositories/conversation_repo.py` (수정) | 🔗 B3.10 후 |
| B3.12 | WebSocket 인증: query param `?token=` 방식 JWT 검증 | `backend/app/api/v1/conversation.py` (수정) — WebSocket 핸들러 | 🔗 S1 완료 후 |
| B3.13 | 음성 API 인증 적용: `speech.py` 인증 추가 + TTS voice_id 유저 프로필 연동 | `backend/app/api/v1/speech.py` (수정)<br>`backend/app/services/tts_service.py` (수정) | 🔀 |
| B3.14 | TTS voice_id 자동 조회: 미지정 시 유저 프로필 → `voices.elevenlabs_voice_id` 매핑 | `backend/app/services/tts_service.py` (수정) | 🔗 B3.13 후 |
| B3.15 | 발음 평가 `user_id` 파라미터화 | `backend/app/services/pronunciation_service.py` (수정) | 🔀 |
| B3.16 | `/api/v1/user/me` 엔드포인트 삭제 | `backend/app/api/v1/user.py` (수정) | 🔀 |
| B3.17 | AI 서비스: 유저 프로필 기반 시스템 프롬프트 personalization (성격 비율 반영) | `backend/app/services/ai_service.py` (수정) | 🔀 |
| B3.18 | 홈 라우터 등록 + 라우터 정리 | `backend/app/api/v1/router.py` (수정) | 🔗 B3.2 후 |
| B3.19 | 단위 테스트: 홈 API, 프로필 수정, 소유권 검증, WebSocket 인증 | `backend/tests/unit/test_home_api.py`<br>`backend/tests/unit/test_profile_update.py`<br>`backend/tests/unit/test_ownership.py` | 🔗 마지막 |

---

### 프론트엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| F3.1 | 4탭 레이아웃: 홈/일기쓰기/히스토리/마이페이지 탭 구조 변경 | `frontend/app/(tabs)/_layout.tsx` (수정) | 🔀 |
| F3.2 | 홈 탭 개편: `/home` API 연동 + 개인화 인사말 + 아바타 표시 + 최근 일기 | `frontend/app/(tabs)/index.tsx` (수정) | 🔗 F3.1 후 |
| F3.3 | 홈 API 서비스 함수: `fetchHome()` | `frontend/src/services/api.ts` (확장) | 🔀 |
| F3.4 | 홈 타입 정의: `HomeResponse`, `HomeStats` | `frontend/src/types/home.ts` (신규) | 🔀 |
| F3.5 | 마이페이지 탭 UI: 프로필 헤더 + 유저 설정 + 언어 설정 + 아바타 설정 + 계정 | `frontend/app/(tabs)/mypage.tsx` (신규) | 🔀 |
| F3.6 | 마이페이지 프로필 수정: 각 섹션별 `PUT /api/v1/user/profile` 연동 | `frontend/app/(tabs)/mypage.tsx` (확장) | 🔗 F3.5 후 |
| F3.7 | 마이페이지 아바타 변경 모달: `GET /avatars` → 선택 → PUT profile | `frontend/src/components/AvatarPickerModal.tsx` (신규) | 🔀 |
| F3.8 | 마이페이지 목소리 변경 모달: `GET /voices?language_id=` → 미리듣기 → PUT profile | `frontend/src/components/VoicePickerModal.tsx` (신규) | 🔀 |
| F3.9 | 마이페이지 성격 편집: 슬라이더 → PUT profile | `frontend/src/components/PersonalityEditor.tsx` (신규) | 🔀 |
| F3.10 | 마이페이지 로그아웃/회원탈퇴: `POST /auth/logout`, `DELETE /auth/account` 연동 | `frontend/app/(tabs)/mypage.tsx` (확장) | 🔗 F3.5 후 |
| F3.11 | WebSocket 연결 시 JWT 전달: `?token=` query param 방식 | `frontend/src/services/websocket.ts` (수정) | 🔀 |
| F3.12 | 일기 쓰기 탭: `Authorization` 헤더 자동 추가 확인 (S1에서 인터셉터 구현됨) | `frontend/app/(tabs)/write.tsx` (수정, 최소) | 🔀 |
| F3.13 | 히스토리 탭: `Authorization` 헤더 자동 추가 확인 | `frontend/app/(tabs)/history.tsx` (수정, 최소) | 🔀 |
| F3.14 | 아바타 스토어 리팩토링: mock 데이터 → 실제 API 교체 | `frontend/src/stores/useAvatarStore.ts` (수정)<br>`frontend/src/services/avatarApi.ts` (수정) | 🔗 F3.7 후 |
| F3.15 | 프로필 API 서비스 함수: `fetchProfile()`, `updateProfile()`, `updateLanguageLevel()` | `frontend/src/services/api.ts` (확장) | 🔀 |
| F3.16 | 프로필 타입 정의: `ProfileResponse`, `ProfileUpdateRequest` | `frontend/src/types/profile.ts` (신규) | 🔀 |

---

### 의존성/협의 포인트

| 항목 | 내용 | 담당 |
|------|------|------|
| ⚠️ `/home` API 응답 구조 | `stats.streak_days`, `stats.today_completed` 계산 로직 확정 필요 | BE |
| ⚠️ WebSocket JWT 전달 | query param 방식 확정 (`?token=<access_token>`) | BE↔FE |
| ⚠️ TTS voice_id 자동 조회 | 프론트는 `voice_id` 미전송, 서버가 유저 프로필에서 자동 조회 | BE |
| ⚠️ `/user/me` 삭제 시점 | 프론트 마이그레이션 후 삭제 (S3 내에서 동시 진행) | BE↔FE |
| ⚠️ 학습 언어 변경 시 voice 리셋 | 서버에서 voice_id null 처리 + 응답에 `voice_reset: true` 포함 | BE→FE |
| AI 프롬프트 personalization | 유저의 empathy/intuition/logic 비율을 시스템 프롬프트에 반영 | BE |

---

## S4: 통합 테스트 + 배포

### 목표
전체 플로우(로그인→온보딩→홈→일기쓰기→히스토리→마이페이지) E2E 테스트를 수행하고, Docker 구성 업데이트 + TestFlight 배포를 완료한다.

### 완료 조건 (Definition of Done)

- [ ] E2E 테스트: 소셜 로그인 → 온보딩 → 홈 진입 플로우 정상
- [ ] E2E 테스트: 인증된 상태에서 일기 생성 → 학습 → 완료 플로우 정상
- [ ] E2E 테스트: 마이페이지 프로필 수정 → 설정 반영 확인
- [ ] E2E 테스트: 토큰 만료 → 자동 갱신 → 재요청 정상
- [ ] E2E 테스트: 로그아웃 → 로그인 화면 이동 정상
- [ ] E2E 테스트: 회원 탈퇴 → 데이터 비활성화 확인
- [ ] Docker Compose 업데이트: 새 환경변수, 시드 데이터 적재 포함
- [ ] iOS TestFlight 빌드 + 배포
- [ ] API 문서 (Swagger) Phase 2 반영 확인
- [ ] CHANGELOG / 릴리즈 노트 작성

---

### 백엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| B4.1 | E2E 테스트: 인증 플로우 (소셜 로그인 mock → JWT 발급 → 갱신 → 로그아웃) | `backend/tests/e2e/test_auth_flow.py` (신규) | 🔀 |
| B4.2 | E2E 테스트: 온보딩 플로우 (프로필 생성 → 시드 데이터 참조) | `backend/tests/e2e/test_onboarding_flow.py` (신규) | 🔀 |
| B4.3 | E2E 테스트: 일기 CRUD + 인증 + 소유권 검증 | `backend/tests/e2e/test_diary_auth.py` (신규) | 🔀 |
| B4.4 | E2E 테스트: 대화 세션 + WebSocket 인증 | `backend/tests/e2e/test_conversation_auth.py` (신규) | 🔀 |
| B4.5 | E2E 테스트: 홈 API + 마이페이지 프로필 수정 | `backend/tests/e2e/test_home_profile.py` (신규) | 🔀 |
| B4.6 | Docker Compose 업데이트: 환경변수 추가 (JWT_SECRET, Google/Apple 키 등) | `docker-compose.yml` (수정)<br>`.env.example` (수정) | 🔀 |
| B4.7 | Docker 시드 데이터 적재: 컨테이너 시작 시 시드 스크립트 자동 실행 | `docker-compose.yml` (수정)<br>`backend/scripts/entrypoint.sh` (수정) | 🔗 B4.6 후 |
| B4.8 | Swagger 문서 검증: 모든 Phase 2 엔드포인트 정상 표시 확인 | 수동 검증 | 🔗 마지막 |
| B4.9 | CHANGELOG 작성 | `CHANGELOG.md` (수정) | 🔗 마지막 |

---

### 프론트엔드 태스크

| # | 태스크 | 파일 | 병렬 |
|---|--------|------|------|
| F4.1 | 통합 테스트: 로그인 → 온보딩 → 홈 진입 E2E | 수동 테스트 / Detox 스크립트 | 🔀 |
| F4.2 | 통합 테스트: 인증 상태에서 일기 쓰기 → 학습 완료 E2E | 수동 테스트 / Detox 스크립트 | 🔀 |
| F4.3 | 통합 테스트: 마이페이지 프로필 수정 → 홈 반영 확인 | 수동 테스트 | 🔀 |
| F4.4 | 통합 테스트: 토큰 만료 시나리오 (강제 만료 → 갱신 → 정상 동작) | 수동 테스트 | 🔀 |
| F4.5 | 통합 테스트: 로그아웃 / 회원탈퇴 플로우 | 수동 테스트 | 🔀 |
| F4.6 | 에러/빈/로딩 상태 폴리싱: 로그인 실패, 네트워크 오류, 온보딩 실패 | 전체 화면 점검 | 🔗 F4.1~F4.5 후 |
| F4.7 | iOS TestFlight 빌드: `eas build` + `eas submit` | EAS CLI | 🔗 F4.6 후 |
| F4.8 | 앱 버전 업데이트 + 릴리즈 노트 | `frontend/app.config.ts` (수정) | 🔗 F4.7 후 |

---

### 의존성/협의 포인트

| 항목 | 내용 | 담당 |
|------|------|------|
| ⚠️ 소셜 로그인 E2E mock | 실제 Google/Apple 토큰 없이 테스트하려면 mock 토큰 전략 필요 | BE |
| ⚠️ TestFlight 배포 | Apple Developer 계정 + EAS 프로젝트 설정 필요 | FE |
| Docker 환경변수 목록 | S1~S3에서 추가된 모든 환경변수 정리 | BE↔FE |

---

## 협의 필요 사항

API_DESIGN_FRONTEND.md 부록 10개 항목 기반 권장 결정:

| # | 질문 | 권장 결정 | 근거 | 스프린트 |
|---|------|----------|------|----------|
| 1 | WebSocket JWT 전달: query param vs 첫 메시지? | ✅ **query param** | 구현 간결, 연결 시점에 즉시 검증. 서버 로그에서 토큰 마스킹 처리 권장 | S3 |
| 2 | TTS voice_id: 서버 자동 조회 vs 프론트 전달? | ✅ **서버 자동 조회** (프론트 override 허용) | 프론트 변경 최소화, 유저 설정 자동 반영. `voice_id` 필드는 optional로 유지 | S3 |
| 3 | 학습 언어 변경 시 voice_id 리셋 정책? | ✅ **서버에서 null로 리셋 + `voice_reset: true` 응답** | voice-language 불일치 방지. 프론트에서 목소리 재선택 유도 UI 표시 | S3 |
| 4 | `/api/v1/home` 통합 API 제공 가능? | ✅ **제공** | waterfall 방지, 홈 화면 로딩 속도 개선. 4개 개별 호출 → 1개 통합 | S3 |
| 5 | `sample_url`, `thumbnail_url` public 접근 가능? | ✅ **public 접근** | `expo-av`, `Image` 컴포넌트에서 인증 헤더 주입 어려움. 정적 파일 서빙 or CDN | S1 |
| 6 | Refresh Token 로테이션 적용? | ✅ **적용** | 보안 강화 (리플레이 공격 방지). 갱신 시 기존 토큰 삭제 + 새 토큰 발급 | S1 |
| 7 | `PUT /api/v1/user/profile` partial update? | ✅ **지원** | 마이페이지 UX: 닉네임만 변경 등 빈번. 전체 전송 강제는 프론트 부담 | S3 |
| 8 | 에러 응답 형식 통일 (`{error: {code, message}}`)? | ✅ **통일** | FastAPI 기본 에러도 동일 형식으로 변환. `error_handler.py` 확장 | S1 |
| 9 | 날짜 범위 필터 (`date_from`, `date_to`) 예약? | ⏳ **파라미터 예약만** (S3에서 구현 보류) | 히스토리 탭 날짜 필터는 Phase 2 범위 밖. 파라미터 무시 처리 | S3 |
| 10 | 온보딩 성격 슬라이더: 합계 100 강제 vs 자유? | ✅ **합계 100 강제** (서버 validation) | 서버: `INVALID_PERSONALITY_SUM` 에러. 프론트: 슬라이더 연동 UI로 자동 맞춤 | S2 |

---

## 신규 파일/디렉토리 구조

### 백엔드 (신규/수정 파일)

```
backend/
├── alembic/versions/
│   ├── xxxx_add_phase2_users.py         # S1 — users 테이블 확장
│   ├── xxxx_add_user_profiles.py        # S1 — user_profiles 생성
│   ├── xxxx_add_refresh_tokens.py       # S1 — refresh_tokens 생성
│   ├── xxxx_add_user_language_levels.py  # S1 — user_language_levels 생성
│   └── xxxx_add_seed_tables.py          # S1 — languages/avatars/voices 생성
├── seeds/
│   ├── languages.json                   # S1 — 시드 데이터
│   ├── avatars.json                     # S1 — 시드 데이터
│   └── voices.json                      # S1 — 시드 데이터
├── app/
│   ├── models/
│   │   ├── user.py                      # S1 — 수정 (social_provider 등 추가)
│   │   ├── profile.py                   # S1 — 신규 (UserProfile 모델)
│   │   ├── auth.py                      # S1 — 신규 (RefreshToken 모델)
│   │   └── seed.py                      # S1 — 신규 (Language, Avatar, Voice)
│   ├── schemas/
│   │   ├── auth.py                      # S1 — 신규
│   │   ├── seed.py                      # S1 — 신규
│   │   ├── user.py                      # S2 — 수정 (프로필 스키마)
│   │   └── home.py                      # S3 — 신규
│   ├── repositories/
│   │   ├── auth_repo.py                 # S1 — 신규
│   │   ├── profile_repo.py              # S2 — 신규
│   │   ├── user_repo.py                 # S2 — 수정
│   │   ├── diary_repo.py               # S3 — 수정 (user_id 필터)
│   │   └── conversation_repo.py         # S3 — 수정 (user_id 필터)
│   ├── services/
│   │   ├── auth_service.py              # S1/S2 — 신규
│   │   ├── profile_service.py           # S2/S3 — 신규
│   │   ├── home_service.py              # S3 — 신규
│   │   ├── ai_service.py               # S3 — 수정 (personalization)
│   │   ├── tts_service.py              # S3 — 수정 (voice_id 연동)
│   │   ├── diary_service.py            # S3 — 수정 (user_id 파라미터)
│   │   ├── conversation_service.py     # S3 — 수정 (user_id 파라미터)
│   │   ├── convai_service.py           # S3 — 수정
│   │   └── pronunciation_service.py    # S3 — 수정
│   ├── api/v1/
│   │   ├── auth.py                      # S1/S2 — 신규
│   │   ├── seed.py                      # S1 — 신규
│   │   ├── home.py                      # S3 — 신규
│   │   ├── user.py                      # S2/S3 — 수정
│   │   ├── diary.py                     # S3 — 수정 (인증)
│   │   ├── conversation.py              # S3 — 수정 (인증 + WS)
│   │   ├── convai.py                    # S3 — 수정 (인증)
│   │   ├── speech.py                    # S3 — 수정 (인증)
│   │   └── router.py                    # S1/S3 — 수정
│   ├── utils/
│   │   ├── jwt.py                       # S1 — 신규
│   │   └── social_auth.py              # S2 — 신규
│   ├── scripts/
│   │   └── seed_data.py                 # S1 — 신규
│   ├── dependencies.py                  # S1 — 수정
│   └── exceptions.py                    # S1 — 수정
├── tests/
│   ├── unit/
│   │   ├── test_jwt.py                  # S1
│   │   ├── test_auth_service.py         # S1
│   │   ├── test_seed_api.py             # S1
│   │   ├── test_social_auth.py          # S2
│   │   ├── test_profile_service.py      # S2
│   │   ├── test_home_api.py             # S3
│   │   ├── test_profile_update.py       # S3
│   │   └── test_ownership.py            # S3
│   └── e2e/
│       ├── test_auth_flow.py            # S4
│       ├── test_onboarding_flow.py      # S4
│       ├── test_diary_auth.py           # S4
│       ├── test_conversation_auth.py    # S4
│       └── test_home_profile.py         # S4
└── scripts/
    └── entrypoint.sh                    # S4 — 수정
```

### 프론트엔드 (신규/수정 파일)

```
frontend/
├── app/
│   ├── _layout.tsx                       # S1/S2 — 수정 (인증 가드)
│   ├── login.tsx                         # S2 — 신규
│   ├── onboarding/
│   │   ├── _layout.tsx                   # S2 — 신규
│   │   ├── step1-language.tsx            # S2 — 신규
│   │   ├── step2-avatar.tsx              # S2 — 신규
│   │   ├── step3-voice.tsx               # S2 — 신규
│   │   └── step4-personality.tsx         # S2 — 신규
│   ├── (tabs)/
│   │   ├── _layout.tsx                   # S3 — 수정 (4탭)
│   │   ├── index.tsx                     # S3 — 수정 (홈 개편)
│   │   ├── write.tsx                     # S3 — 수정 (최소, 인증)
│   │   ├── history.tsx                   # S3 — 수정 (최소, 인증)
│   │   └── mypage.tsx                    # S3 — 신규
│   ├── diary/[id].tsx                    # 수정 없음
│   └── learning/[id].tsx                 # 수정 없음
├── src/
│   ├── types/
│   │   ├── index.ts                      # S1 — 수정
│   │   ├── auth.ts                       # S1 — 신규
│   │   ├── seed.ts                       # S1 — 신규
│   │   ├── profile.ts                    # S3 — 신규
│   │   └── home.ts                       # S3 — 신규
│   ├── stores/
│   │   ├── useAuthStore.ts               # S1 — 신규
│   │   ├── useOnboardingStore.ts         # S2 — 신규
│   │   ├── useProfileStore.ts            # S2 — 신규
│   │   ├── useAvatarStore.ts             # S3 — 수정
│   │   ├── useDiaryStore.ts              # 수정 없음 (인터셉터가 처리)
│   │   └── useConversationStore.ts       # 수정 없음 (인터셉터가 처리)
│   ├── services/
│   │   ├── api.ts                        # S1 — 수정 (인터셉터)
│   │   ├── authApi.ts                    # S2 — 신규
│   │   ├── avatarApi.ts                  # S3 — 수정 (mock→실제)
│   │   └── websocket.ts                  # S3 — 수정 (JWT 전달)
│   ├── utils/
│   │   ├── tokenManager.ts              # S1 — 신규
│   │   └── audio.ts                     # 수정 없음
│   ├── components/
│   │   ├── AvatarPickerModal.tsx         # S3 — 신규
│   │   ├── VoicePickerModal.tsx          # S3 — 신규
│   │   └── PersonalityEditor.tsx         # S3 — 신규
│   └── hooks/
│       └── (기존 유지)
└── app.config.ts                         # S2 — 수정 (OAuth 설정)
```

---

## 예상 기간

### 에이전트 기준 작업일 (1일 = 풀타임 에이전트 하루)

| 스프린트 | 백엔드 | 프론트엔드 | 병렬 실행 시 소요 | 비고 |
|---------|--------|-----------|------------------|------|
| **S1** | 2일 | 1.5일 | **2일** | DB + JWT가 가장 무거움 |
| **S2** | 2일 | 2.5일 | **2.5일** | 프론트 온보딩 4화면이 가장 무거움 |
| **S3** | 3일 | 2.5일 | **3일** | 기존 API 인증 적용 범위 넓음 |
| **S4** | 1.5일 | 1.5일 | **1.5일** | 테스트 + 배포 |
| **버퍼** | — | — | **1~2일** | 예상치 못한 이슈 대응 |
| **합계** | 8.5일 | 8일 | **10~12일** | BE↔FE 병렬 실행 기준 |

### 스프린트 일정 요약

```
S1 ████████░░░░░░░░░░░░░░░░  (Day 1~2)
S2 ░░░░░░░░██████████░░░░░░  (Day 3~5)
S3 ░░░░░░░░░░░░░░░░██████████████  (Day 6~8)
S4 ░░░░░░░░░░░░░░░░░░░░░░░░██████  (Day 9~10)
Buffer ░░░░░░░░░░░░░░░░░░░░░░░░░░████  (Day 11~12)
```

### 태스크 수 총계

| 구분 | S1 | S2 | S3 | S4 | 합계 |
|------|----|----|----|----|------|
| 백엔드 | 20 | 14 | 19 | 9 | **62** |
| 프론트엔드 | 7 | 14 | 16 | 8 | **45** |
| **합계** | 27 | 28 | 35 | 17 | **107** |

---

## 부록: 위험 요소 및 완화 전략

| 위험 | 영향 | 확률 | 완화 전략 |
|------|------|------|----------|
| Apple Sign In 설정 복잡도 | S2 지연 | 중 | Google 우선 구현, Apple은 S2 후반 |
| Alembic 미도입 상태 | S1 지연 | 중 | S1 첫 태스크로 Alembic 초기화 포함 |
| 기존 API 인증 적용 시 레거시 코드 이슈 | S3 지연 | 중 | 서비스 레이어 파라미터화를 체계적으로 진행 |
| 소셜 로그인 E2E 테스트 어려움 | S4 품질 | 중 | mock 토큰 전략 사전 설계 (S2에서) |
| `expo-secure-store` iOS 시뮬레이터 제한 | 개발 지연 | 저 | 개발 시 AsyncStorage 폴백 환경 변수 |
