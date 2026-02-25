# Phase 2 — 백엔드 API 설계 초안

> **상태**: 초안 (프론트엔드 조율 전)
> **작성일**: 2025-02-25
> **기반 문서**: PRD F8/F9/F10

---

## 목차

1. [공통 사항](#1-공통-사항)
2. [인증 API (`/api/v1/auth`)](#2-인증-api-apiv1auth)
3. [유저/온보딩 API (`/api/v1/user`)](#3-유저온보딩-api-apiv1user)
4. [시드 데이터 API](#4-시드-데이터-api)
5. [기존 API 변경사항](#5-기존-api-변경사항)
6. [에러 코드 추가](#6-에러-코드-추가)
7. [구현 우선순위](#7-구현-우선순위)

---

## 1. 공통 사항

### 1.1 인증 미들웨어

Phase 2부터 모든 API(인증 관련 제외)에 JWT 인증을 적용한다.

```
Authorization: Bearer <access_token>
```

- **Access Token**: JWT, 30분 만료
- **Refresh Token**: opaque 토큰, 30일 만료, DB 저장 (SHA-256 해시)
- JWT payload: `{ sub: user_id, exp, iat }`

### 1.2 인증 의존성 (FastAPI Depends)

```python
# 인증 필수 — 미인증 시 401
async def get_current_user(token: str = Depends(oauth2_scheme)) -> User

# 인증 + 온보딩 완료 필수 — 미완료 시 403 (ONBOARDING_REQUIRED)
async def get_onboarded_user(user: User = Depends(get_current_user)) -> User
```

### 1.3 응답 형식

기존 MVP 응답 형식 유지. 에러 응답:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "사용자 친화적 메시지",
    "detail": "디버그 상세 (optional)"
  }
}
```

---

## 2. 인증 API (`/api/v1/auth`)

### 2.1 POST `/api/v1/auth/social` — 소셜 로그인

소셜 토큰(id_token)을 검증하고, 자체 JWT를 발급한다. 신규 유저는 자동 생성.

| 항목 | 내용 |
|------|------|
| **인증** | 불필요 (공개 API) |

**Request**

```json
{
  "provider": "google",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5..."
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `provider` | string | ✅ | `"google"` 또는 `"apple"` |
| `id_token` | string | ✅ | 소셜 로그인에서 받은 ID Token |

**Response — 200 OK** (기존 유저) / **201 Created** (신규 유저)

```json
{
  "access_token": "eyJhbGciOi...",
  "refresh_token": "dGhpcyBpcyBhIH...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": 1,
    "email": "user@gmail.com",
    "nickname": "홍길동",
    "social_provider": "google",
    "onboarding_completed": false
  }
}
```

**Response — 401 Unauthorized**

```json
{
  "error": {
    "code": "INVALID_SOCIAL_TOKEN",
    "message": "소셜 로그인 인증에 실패했습니다."
  }
}
```

**구현 포인트**
- Google: `google-auth` 라이브러리로 id_token 검증 (Google 공개키 캐싱)
- Apple: Apple 공개키로 JWT 직접 검증 (`PyJWT` + Apple JWKS endpoint)
- 신규 유저: `users` 테이블에 자동 INSERT + `user_profiles` 기본값으로 생성
- 기존 유저: `social_provider + social_id` 기준 조회
- `onboarding_completed` 플래그를 응답에 포함하여 프론트가 라우팅 결정

---

### 2.2 POST `/api/v1/auth/refresh` — 토큰 갱신

만료된 Access Token을 Refresh Token으로 갱신한다.

| 항목 | 내용 |
|------|------|
| **인증** | 불필요 (Refresh Token으로 인증) |

**Request**

```json
{
  "refresh_token": "dGhpcyBpcyBhIH..."
}
```

**Response — 200 OK**

```json
{
  "access_token": "eyJhbGciOi...(new)",
  "refresh_token": "bmV3IHJlZnJl...(new, rotated)",
  "token_type": "bearer",
  "expires_in": 1800
}
```

**Response — 401 Unauthorized**

```json
{
  "error": {
    "code": "INVALID_REFRESH_TOKEN",
    "message": "리프레시 토큰이 유효하지 않거나 만료되었습니다."
  }
}
```

**구현 포인트**
- Refresh Token Rotation: 갱신 시 기존 토큰 삭제 + 새 토큰 발급 (리플레이 공격 방지)
- DB에서 `token_hash` 매칭 + `expires_at` 확인
- 사용된 토큰은 즉시 삭제

---

### 2.3 POST `/api/v1/auth/logout` — 로그아웃

현재 Refresh Token을 무효화한다.

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 |

**Request**

```json
{
  "refresh_token": "dGhpcyBpcyBhIH..."
}
```

**Response — 204 No Content**

(빈 응답)

**구현 포인트**
- `refresh_tokens` 테이블에서 해당 토큰 삭제
- Access Token은 stateless이므로 서버에서 즉시 무효화 불가 → 클라이언트가 삭제
- 필요 시 블랙리스트(Redis TTL) 도입 가능하나 MVP Phase 2에서는 생략

---

### 2.4 DELETE `/api/v1/auth/account` — 회원 탈퇴

소프트 삭제. 유저 데이터 비활성화.

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 |

**Request**

(빈 body)

**Response — 204 No Content**

(빈 응답)

**구현 포인트**
- `users.is_active = false`, `users.deleted_at = NOW()`
- 해당 유저의 모든 `refresh_tokens` 삭제
- 개인정보 처리: 이메일/닉네임 마스킹 또는 삭제 정책은 별도 논의 필요
- 30일 유예 후 물리 삭제 정책 권장 (배치 작업)

---

## 3. 유저/온보딩 API (`/api/v1/user`)

### 3.1 GET `/api/v1/user/profile` — 내 프로필 조회

로그인한 유저의 프로필 + 온보딩 상태를 조회한다.

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 (온보딩 미완료도 접근 가능) |

**Request**

(없음 — JWT에서 user_id 추출)

**Response — 200 OK**

```json
{
  "id": 1,
  "email": "user@gmail.com",
  "nickname": "홍길동",
  "social_provider": "google",
  "is_active": true,
  "created_at": "2026-02-25T12:00:00Z",
  "profile": {
    "app_locale": "ko",
    "native_language": {
      "id": 1,
      "code": "ko",
      "name_native": "한국어"
    },
    "target_language": {
      "id": 2,
      "code": "en",
      "name_native": "English"
    },
    "avatar": {
      "id": 1,
      "name": "Luna",
      "thumbnail_url": "/static/avatars/luna.png",
      "primary_color": "#6C63FF"
    },
    "avatar_name": "루나",
    "voice": {
      "id": 1,
      "name": "밝은 여성",
      "gender": "female",
      "sample_url": "/static/voices/bright_female.mp3"
    },
    "empathy": 40,
    "intuition": 30,
    "logic": 30,
    "onboarding_completed": true
  },
  "language_level": {
    "cefr_level": "B1",
    "language_id": 2
  }
}
```

**구현 포인트**
- `get_current_user` 의존성 사용 (온보딩 미완료도 허용)
- `user_profiles`가 없으면 `profile: null` 반환 (온보딩 전 상태)
- 관련 시드 데이터(language, avatar, voice)는 JOIN으로 한번에 조회
- `language_level`은 `user_language_levels` 테이블에서 target_language 기준 조회, 없으면 `null`

---

### 3.2 POST `/api/v1/user/profile` — 온보딩 완료 (프로필 생성)

온보딩 과정에서 개인설정을 저장하고 `onboarding_completed = true`로 설정한다.

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 |

**Request**

```json
{
  "app_locale": "ko",
  "native_language_id": 1,
  "target_language_id": 2,
  "avatar_id": 1,
  "avatar_name": "루나",
  "voice_id": 3,
  "empathy": 40,
  "intuition": 30,
  "logic": 30,
  "cefr_level": "A2"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `app_locale` | string | ✅ | 앱 UI 언어 코드 (ko, en, ja 등) |
| `native_language_id` | int | ✅ | 모국어 → `languages.id` |
| `target_language_id` | int | ✅ | 학습 언어 → `languages.id` |
| `avatar_id` | int | ✅ | 아바타 → `avatars.id` |
| `avatar_name` | string | ❌ | 유저가 붙인 아바타 이름 (없으면 기본 이름 사용) |
| `voice_id` | int | ✅ | 목소리 → `voices.id` |
| `empathy` | int | ✅ | 공감 비율 (0~100) |
| `intuition` | int | ✅ | 직관 비율 (0~100) |
| `logic` | int | ✅ | 논리 비율 (0~100) |
| `cefr_level` | string | ❌ | CEFR 레벨 (A1~C2), 기본 A1 |

**Response — 201 Created**

```json
{
  "message": "프로필이 생성되었습니다.",
  "onboarding_completed": true
}
```

**Response — 409 Conflict**

```json
{
  "error": {
    "code": "PROFILE_ALREADY_EXISTS",
    "message": "이미 프로필이 존재합니다. PUT으로 수정해주세요."
  }
}
```

**구현 포인트**
- `empathy + intuition + logic == 100` 검증 (서버 사이드)
- `voice_id`가 `target_language_id`에 해당하는 언어의 목소리인지 검증
- `user_profiles` INSERT + `onboarding_completed = true`
- `cefr_level` 제공 시 `user_language_levels` INSERT/UPDATE
- 이미 `user_profiles`가 존재하면 409 반환

---

### 3.3 PUT `/api/v1/user/profile` — 프로필 수정

마이페이지에서 프로필 정보를 수정한다. Partial update 지원.

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 + 온보딩 완료 필수 |

**Request**

```json
{
  "nickname": "새닉네임",
  "app_locale": "en",
  "native_language_id": 1,
  "target_language_id": 3,
  "avatar_id": 2,
  "avatar_name": "모치",
  "voice_id": 5,
  "empathy": 50,
  "intuition": 25,
  "logic": 25,
  "cefr_level": "B1"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `nickname` | string | ❌ | 닉네임 변경 → `users.nickname` |
| `app_locale` | string | ❌ | 앱 UI 언어 |
| `native_language_id` | int | ❌ | 모국어 |
| `target_language_id` | int | ❌ | 학습 언어 |
| `avatar_id` | int | ❌ | 아바타 외형 |
| `avatar_name` | string | ❌ | 아바타 이름 |
| `voice_id` | int | ❌ | 목소리 |
| `empathy` | int | ❌ | 공감 |
| `intuition` | int | ❌ | 직관 |
| `logic` | int | ❌ | 논리 |
| `cefr_level` | string | ❌ | CEFR 레벨 |

> 모든 필드 optional. 보낸 필드만 업데이트 (partial update).

**Response — 200 OK**

```json
{
  "message": "프로필이 수정되었습니다."
}
```

**구현 포인트**
- `empathy, intuition, logic`는 3개 모두 함께 제공해야 함 (하나만 변경 불가) — 합계 100 검증
- `target_language_id` 변경 시 `voice_id`가 새 언어에 맞는지 검증. 불일치 시 400 반환
- `nickname`은 `users` 테이블, 나머지는 `user_profiles` 테이블 업데이트
- `cefr_level` 변경 시 `user_language_levels` UPSERT (target_language 기준)
- `target_language_id` 변경 시 기존 `user_language_levels`는 유지, 새 언어에 대해 UPSERT

---

## 4. 시드 데이터 API

공개 API가 아닌 인증된 유저만 조회 가능. 온보딩 화면에서 사용하므로 `get_current_user`(온보딩 미완료 허용) 의존성 적용.

### 4.1 GET `/api/v1/languages` — 언어 목록 조회

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 |

**Request**

| Query Param | 타입 | 필수 | 설명 |
|-------------|------|------|------|
| `active_only` | bool | ❌ | `true`(기본값) — 활성 언어만 반환 |

**Response — 200 OK**

```json
{
  "items": [
    {
      "id": 1,
      "code": "ko",
      "name_native": "한국어",
      "is_active": true
    },
    {
      "id": 2,
      "code": "en",
      "name_native": "English",
      "is_active": true
    },
    {
      "id": 3,
      "code": "ja",
      "name_native": "日本語",
      "is_active": true
    }
  ]
}
```

**구현 포인트**
- 시드 데이터이므로 응답 캐싱 권장 (Cache-Control 헤더 또는 서버 캐시)
- 화면 표시 텍스트(번역)는 프론트 i18n에서 처리, DB는 `code` + `name_native`만 제공

---

### 4.2 GET `/api/v1/avatars` — 아바타 목록 조회

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 |

**Request**

| Query Param | 타입 | 필수 | 설명 |
|-------------|------|------|------|
| `active_only` | bool | ❌ | `true`(기본값) — 활성 아바타만 반환 |

**Response — 200 OK**

```json
{
  "items": [
    {
      "id": 1,
      "name": "Luna",
      "thumbnail_url": "/static/avatars/luna.png",
      "primary_color": "#6C63FF",
      "is_active": true
    },
    {
      "id": 2,
      "name": "Mochi",
      "thumbnail_url": "/static/avatars/mochi.png",
      "primary_color": "#FF6B6B",
      "is_active": true
    }
  ]
}
```

**구현 포인트**
- `model_url`(Live2D)은 아직 사용하지 않으므로 응답에서 제외 (필요 시 추후 포함)
- 이미지 URL은 정적 파일 경로 또는 CDN URL

---

### 4.3 GET `/api/v1/voices` — 목소리 목록 조회

| 항목 | 내용 |
|------|------|
| **인증** | Bearer Token 필요 |

**Request**

| Query Param | 타입 | 필수 | 설명 |
|-------------|------|------|------|
| `language_id` | int | ❌ | 특정 언어의 목소리만 필터링 |
| `active_only` | bool | ❌ | `true`(기본값) — 활성 목소리만 반환 |

**Response — 200 OK**

```json
{
  "items": [
    {
      "id": 1,
      "language_id": 2,
      "name": "밝은 여성",
      "gender": "female",
      "tone": "활발한",
      "sample_url": "/static/voices/bright_female.mp3",
      "description": "밝고 활기찬 톤의 여성 음성",
      "is_active": true
    },
    {
      "id": 2,
      "language_id": 2,
      "name": "차분한 남성",
      "gender": "male",
      "tone": "차분한",
      "sample_url": "/static/voices/calm_male.mp3",
      "description": "차분하고 안정적인 톤의 남성 음성",
      "is_active": true
    }
  ]
}
```

**구현 포인트**
- `elevenlabs_voice_id`는 내부 구현 디테일이므로 응답에 포함하지 않음
- `language_id` 필터는 온보딩 Step 3에서 유저의 `target_language`에 맞는 목소리만 보여줄 때 사용
- 프론트에서 목소리 선택 시 sample_url로 미리듣기 구현

---

## 5. 기존 API 변경사항

### 5.1 변경 원칙

현재 MVP는 `user_id=1` 하드코딩. Phase 2에서 JWT 인증 미들웨어를 적용하여 `현재 로그인 유저` 기반으로 변경.

**변경 방식**:
1. `get_onboarded_user` 의존성을 각 엔드포인트에 추가
2. 서비스 레이어에서 하드코딩된 `user_id=1` → `current_user.id`로 교체
3. 데이터 접근 시 `user_id` 필터 추가 (본인 데이터만 접근)

### 5.2 변경 대상 엔드포인트

#### GET `/api/v1/user/me` → GET `/api/v1/user/profile`로 통합

| 변경 전 | 변경 후 |
|---------|---------|
| `GET /api/v1/user/me` | **삭제** → `GET /api/v1/user/profile`로 대체 |
| 하드코딩 `user_id=1` | JWT에서 추출한 `current_user.id` |

> `/user/me`는 `/user/profile`에 흡수. 프론트와 마이그레이션 일정 조율 필요.

---

#### GET `/api/v1/diary` — 일기 목록

| 변경 전 | 변경 후 |
|---------|---------|
| 전체 일기 조회 (user 무관) | `WHERE user_id = current_user.id` 필터 추가 |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

```python
# Before
@router.get("", response_model=DiaryListResponse)
async def list_diaries(cursor, limit, service):
    return await service.get_list(cursor=cursor, limit=limit)

# After
@router.get("", response_model=DiaryListResponse)
async def list_diaries(
    cursor, limit, service,
    user: User = Depends(get_onboarded_user),
):
    return await service.get_list(user_id=user.id, cursor=cursor, limit=limit)
```

---

#### GET `/api/v1/diary/{diary_id}` — 일기 상세

| 변경 전 | 변경 후 |
|---------|---------|
| diary_id로만 조회 | `user_id = current_user.id` 검증 추가 (403) |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### PUT `/api/v1/diary/{diary_id}` — 일기 수정

| 변경 전 | 변경 후 |
|---------|---------|
| diary_id로만 조회/수정 | 소유권 검증 (`user_id = current_user.id`) |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### DELETE `/api/v1/diary/{diary_id}` — 일기 삭제

| 변경 전 | 변경 후 |
|---------|---------|
| diary_id로만 삭제 | 소유권 검증 (`user_id = current_user.id`) |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### POST `/api/v1/diary/{diary_id}/complete` — 학습 완료

| 변경 전 | 변경 후 |
|---------|---------|
| diary_id로만 처리 | 소유권 검증 |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### POST `/api/v1/conversation` — 대화 세션 생성

| 변경 전 | 변경 후 |
|---------|---------|
| `user_id=1` 하드코딩 | `current_user.id`로 세션 생성 |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### GET `/api/v1/conversation/{session_id}` — 대화 세션 조회

| 변경 전 | 변경 후 |
|---------|---------|
| session_id로만 조회 | 소유권 검증 (`user_id = current_user.id`) |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### WebSocket `/ws/conversation/{session_id}` — 실시간 대화

| 변경 전 | 변경 후 |
|---------|---------|
| 인증 없음 | WebSocket 연결 시 토큰 검증 필요 |
| `user_id=1` | JWT에서 추출한 user_id |

**WebSocket 인증 방식** (택 1, 프론트 협의 필요):

```
# Option A: Query parameter (권장 — WebSocket에서 가장 간단)
ws://host/ws/conversation/{session_id}?token=<access_token>

# Option B: 첫 메시지에서 인증
{ "type": "auth", "token": "<access_token>" }
```

> **권장**: Option A (query param) — 연결 시점에 검증하여 미인증 연결 즉시 차단.

---

#### POST `/api/v1/convai/session` — ConvAI 세션 생성

| 변경 전 | 변경 후 |
|---------|---------|
| `user_id=1` | `current_user.id` |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### POST `/api/v1/convai/session/{session_id}/finish` — ConvAI 완료

| 변경 전 | 변경 후 |
|---------|---------|
| session_id로만 처리 | 소유권 검증 |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

#### POST `/api/v1/speech/tts` — TTS 생성

| 변경 전 | 변경 후 |
|---------|---------|
| 인증 없음 | `get_onboarded_user` 의존성 추가 |
| voice_id 고정 | 유저 프로필의 `voice_id` 기본값 사용 (요청 시 override 가능) |

---

#### POST `/api/v1/speech/evaluate` — 발음 평가

| 변경 전 | 변경 후 |
|---------|---------|
| `MVP_USER_ID = 1` 하드코딩 | `current_user.id` |
| 인증 없음 | `get_onboarded_user` 의존성 추가 |

---

### 5.3 TTS voice_id 연동 변경

Phase 2에서 유저별 선택한 목소리를 TTS에 적용:

1. `POST /api/v1/speech/tts` 요청 시 `voice_id` 미지정이면 → `user_profiles.voice_id` → `voices.elevenlabs_voice_id` 매핑
2. WebSocket 대화 중 AI 응답 TTS도 유저의 voice_id 적용
3. `TTSRequest` 스키마의 `voice_id` 필드는 유지 (override용)

---

## 6. 에러 코드 추가

Phase 2에서 추가되는 에러 코드:

| 코드 | HTTP | 설명 |
|------|------|------|
| `INVALID_SOCIAL_TOKEN` | 401 | 소셜 로그인 토큰 검증 실패 |
| `INVALID_ACCESS_TOKEN` | 401 | Access Token 검증 실패 / 만료 |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh Token 검증 실패 / 만료 |
| `ONBOARDING_REQUIRED` | 403 | 온보딩 미완료 상태에서 서비스 API 접근 |
| `PROFILE_ALREADY_EXISTS` | 409 | 이미 프로필이 존재 (POST 중복) |
| `PROFILE_NOT_FOUND` | 404 | 프로필이 존재하지 않음 (PUT 시) |
| `INVALID_PERSONALITY_SUM` | 400 | empathy + intuition + logic ≠ 100 |
| `VOICE_LANGUAGE_MISMATCH` | 400 | voice_id의 언어가 target_language와 불일치 |
| `FORBIDDEN` | 403 | 다른 유저의 리소스에 접근 시도 |
| `ACCOUNT_DEACTIVATED` | 403 | 탈퇴/비활성화된 계정으로 접근 |

---

## 7. 구현 우선순위

### Phase 2-A: 인증 + 시드 데이터 (선행)

1. DB 마이그레이션 (F8 스키마 적용)
2. 시드 데이터 API (`/languages`, `/avatars`, `/voices`)
3. `POST /api/v1/auth/social` (Google 우선, Apple 후속)
4. `POST /api/v1/auth/refresh`
5. JWT 인증 미들웨어 (`get_current_user`, `get_onboarded_user`)

### Phase 2-B: 온보딩 + 프로필

6. `POST /api/v1/user/profile` (온보딩 완료)
7. `GET /api/v1/user/profile`
8. `PUT /api/v1/user/profile`

### Phase 2-C: 기존 API 마이그레이션

9. 기존 모든 엔드포인트에 인증 의존성 적용
10. 서비스 레이어 `user_id` 파라미터화
11. 소유권 검증 로직 추가
12. WebSocket 인증 적용

### Phase 2-D: 부가 기능

13. `POST /api/v1/auth/logout`
14. `DELETE /api/v1/auth/account`
15. TTS voice_id 유저별 연동

---

## 엔드포인트 요약 (전체)

### 신규 API

| Method | Path | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/v1/auth/social` | 소셜 로그인 + JWT 발급 | ❌ |
| POST | `/api/v1/auth/refresh` | Access Token 갱신 | ❌ (Refresh Token) |
| POST | `/api/v1/auth/logout` | 로그아웃 | ✅ |
| DELETE | `/api/v1/auth/account` | 회원 탈퇴 | ✅ |
| GET | `/api/v1/user/profile` | 프로필 조회 | ✅ |
| POST | `/api/v1/user/profile` | 프로필 생성 (온보딩) | ✅ |
| PUT | `/api/v1/user/profile` | 프로필 수정 | ✅ + 온보딩 |
| GET | `/api/v1/languages` | 언어 목록 | ✅ |
| GET | `/api/v1/avatars` | 아바타 목록 | ✅ |
| GET | `/api/v1/voices` | 목소리 목록 | ✅ |

### 변경 API (인증 적용)

| Method | Path | 변경 내용 |
|--------|------|-----------|
| GET | `/api/v1/diary` | + 인증, + user_id 필터 |
| GET | `/api/v1/diary/{id}` | + 인증, + 소유권 검증 |
| PUT | `/api/v1/diary/{id}` | + 인증, + 소유권 검증 |
| DELETE | `/api/v1/diary/{id}` | + 인증, + 소유권 검증 |
| POST | `/api/v1/diary/{id}/complete` | + 인증, + 소유권 검증 |
| POST | `/api/v1/conversation` | + 인증, user_id 파라미터화 |
| GET | `/api/v1/conversation/{id}` | + 인증, + 소유권 검증 |
| WS | `/ws/conversation/{id}` | + 토큰 검증 (query param) |
| POST | `/api/v1/convai/session` | + 인증, user_id 파라미터화 |
| POST | `/api/v1/convai/session/{id}/finish` | + 인증, + 소유권 검증 |
| POST | `/api/v1/speech/tts` | + 인증, + 유저 voice_id 연동 |
| POST | `/api/v1/speech/evaluate` | + 인증, user_id 파라미터화 |

### 삭제 API

| Method | Path | 사유 |
|--------|------|------|
| GET | `/api/v1/user/me` | `/api/v1/user/profile`로 통합 |
