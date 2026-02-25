# Phase 2 API 요구사항 — 프론트엔드 관점

> **작성일**: 2025-02-25  
> **상태**: 초안 (Draft) — 백엔드 조율 전  
> **대상**: F8 (DB 스키마 확장), F9 (소셜 로그인 + 온보딩), F10 (4탭 구조)

---

## 목차

1. [현재 상태 (MVP)](#1-현재-상태-mvp)
2. [인증 플로우](#2-인증-플로우)
3. [온보딩 플로우](#3-온보딩-플로우)
4. [4탭 화면별 필요 API](#4-4탭-화면별-필요-api)
5. [공통 요구사항](#5-공통-요구사항)
6. [프론트엔드 특별 요청 사항](#6-프론트엔드-특별-요청-사항)
7. [API 엔드포인트 총 정리](#7-api-엔드포인트-총-정리)
8. [마이그레이션 계획](#8-마이그레이션-계획)

---

## 1. 현재 상태 (MVP)

### 현재 API 사용 현황

| 기능 | 엔드포인트 | 방식 |
|------|-----------|------|
| 대화 세션 생성 | `POST /api/v1/conversation` | REST |
| 대화 진행 | `WS /ws/conversation/{session_id}` | WebSocket |
| 일기 목록 | `GET /api/v1/diary?cursor=&limit=` | REST (커서 페이지네이션) |
| 일기 상세 | `GET /api/v1/diary/{id}` | REST |
| 일기 수정 | `PUT /api/v1/diary/{id}` | REST |
| 일기 삭제 | `DELETE /api/v1/diary/{id}` | REST |
| 학습 완료 | `POST /api/v1/diary/{id}/complete` | REST |
| TTS | `POST /api/v1/speech/tts` | REST |
| 발음 평가 | `POST /api/v1/speech/evaluate` | REST |

### 현재 인증: 없음 (user_id=1 하드코딩)

- `Authorization` 헤더 미사용
- 아바타 목록: 프론트 mock 데이터 (`avatarApi.ts`)
- 유저 프로필: 존재하지 않음

### 현재 상태 관리 (Zustand)

| Store | 역할 |
|-------|------|
| `useDiaryStore` | 일기 목록/삭제 (커서 기반 페이지네이션) |
| `useConversationStore` | 대화 세션 + WebSocket + 음성 상태 |
| `useAvatarStore` | 아바타 목록 (현재 mock) |

### 현재 탭 구조: 3탭

```
홈 (index) | 일기 쓰기 (write) | 히스토리 (history)
```

---

## 2. 인증 플로우

### 2.1 소셜 로그인 API

#### `POST /api/v1/auth/social`

소셜 로그인 토큰을 검증하고 자체 JWT를 발급한다.

**Request:**
```jsonc
{
  "provider": "google" | "apple",
  "id_token": "소셜 플랫폼에서 받은 id_token"
}
```

**Response (200 OK):**
```jsonc
{
  "access_token": "eyJhbG...",
  "refresh_token": "dGhpcyBpcyB...",
  "token_type": "bearer",
  "expires_in": 1800,  // 초 단위 (30분)
  "user": {
    "id": 1,
    "email": "user@example.com",
    "nickname": "홍길동",
    "social_provider": "google",
    "onboarding_completed": false,  // ⭐ 핵심: 온보딩 완료 여부
    "created_at": "2026-02-25T12:00:00Z"
  }
}
```

**프론트 처리 로직:**
```
1. expo-auth-session (Google) 또는 expo-apple-authentication (Apple) → id_token 획득
2. POST /api/v1/auth/social 호출
3. 응답의 access_token, refresh_token → SecureStore에 저장
4. user.onboarding_completed 확인:
   - false → 온보딩 화면으로 이동
   - true → 홈 탭으로 이동
```

**에러 응답:**
| HTTP | 코드 | 상황 |
|------|------|------|
| 400 | `INVALID_TOKEN` | 소셜 토큰 검증 실패 |
| 400 | `UNSUPPORTED_PROVIDER` | 지원하지 않는 provider |
| 409 | `EMAIL_CONFLICT` | 다른 provider로 이미 가입된 이메일 |

### 2.2 토큰 갱신 API

#### `POST /api/v1/auth/refresh`

**Request:**
```jsonc
{
  "refresh_token": "dGhpcyBpcyB..."
}
```

**Response (200 OK):**
```jsonc
{
  "access_token": "eyJhbG...(새로운 토큰)",
  "refresh_token": "bWF5YmUg...(로테이션된 새 refresh_token)",
  "token_type": "bearer",
  "expires_in": 1800
}
```

**에러 응답:**
| HTTP | 코드 | 상황 |
|------|------|------|
| 401 | `INVALID_REFRESH_TOKEN` | 유효하지 않은 리프레시 토큰 |
| 401 | `REFRESH_TOKEN_EXPIRED` | 리프레시 토큰 만료 (30일) |
| 401 | `REFRESH_TOKEN_REVOKED` | 이미 사용/폐기된 토큰 |

### 2.3 로그아웃 API

#### `POST /api/v1/auth/logout`

**Request Header:** `Authorization: Bearer <access_token>`

**Request Body:**
```jsonc
{
  "refresh_token": "dGhpcyBpcyB..."  // 서버에서 폐기
}
```

**Response:** `204 No Content`

**프론트 처리:**
```
1. POST /api/v1/auth/logout (refresh_token 폐기 요청)
2. SecureStore에서 access_token, refresh_token 삭제
3. Zustand 스토어 전체 초기화
4. 로그인 화면으로 이동
```

### 2.4 회원 탈퇴 API

#### `DELETE /api/v1/auth/account`

**Request Header:** `Authorization: Bearer <access_token>`

**Response:** `204 No Content`

**프론트 처리:**
```
1. 확인 모달 (되돌릴 수 없다는 안내)
2. DELETE /api/v1/auth/account 호출
3. 로컬 토큰 삭제 + 스토어 초기화
4. 로그인 화면으로 이동
```

### 2.5 JWT 저장/관리 방식

| 항목 | 방식 | 이유 |
|------|------|------|
| **저장소** | `expo-secure-store` (SecureStore) | Keychain(iOS)/Keystore(Android) — AsyncStorage보다 안전 |
| **Access Token** | SecureStore `auth_access_token` 키 | 30분 만료 |
| **Refresh Token** | SecureStore `auth_refresh_token` 키 | 30일 만료, 로테이션 |
| **유저 정보** | Zustand in-memory + AsyncStorage 캐시 | 앱 재시작 시 빠른 로딩 |

### 2.6 토큰 자동 갱신 (Interceptor)

```
모든 API 요청 → 401 응답 시:
  1. refresh_token으로 POST /api/v1/auth/refresh 호출
  2. 성공 → 새 access_token 저장 + 원래 요청 재시도
  3. 실패 → 로그인 화면으로 이동
  
동시 요청 시 refresh 중복 방지:
  - refreshing 플래그 + 대기 큐(Promise 배열)로 관리
```

**프론트 구현 방식:** `api.ts`의 `handleResponse` 또는 래퍼 함수에서 401 인터셉트

### 2.7 앱 시작 시 인증 흐름

```
앱 시작
  ↓
SecureStore에서 access_token 읽기
  ├── 토큰 없음 → 로그인 화면
  ├── 토큰 있음 → JWT 디코딩 (exp 확인)
  │     ├── 만료됨 → POST /api/v1/auth/refresh
  │     │     ├── 성공 → onboarding 확인 → 홈 or 온보딩
  │     │     └── 실패 → 로그인 화면
  │     └── 유효함 → GET /api/v1/user/profile
  │           ├── onboarding_completed=true → 홈
  │           └── onboarding_completed=false → 온보딩
  └── (네트워크 오프라인) → 캐시된 유저 정보로 홈 진입
```

---

## 3. 온보딩 플로우

### 3.1 온보딩 여부 판단

- **1순위**: `POST /api/v1/auth/social` 응답의 `user.onboarding_completed`
- **2순위** (앱 재시작 시): `GET /api/v1/user/profile` 응답의 `onboarding_completed`
- **로컬 캐시**: Zustand에 `onboardingCompleted` 상태 유지 (AsyncStorage persist)

### 3.2 온보딩 단계별 필요 API

#### Step 1: 언어 선택

**필요 API:**

##### `GET /api/v1/languages`

언어 목록 조회 (모국어/학습 언어 선택에 사용)

**Response:**
```jsonc
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

**프론트 처리:**
- 화면 표시 텍스트는 프론트 i18n 파일에서 관리 (DB의 `name_native`는 보조용)
- 초기 버전: 모국어=한국어, 학습 언어=영어 고정이지만 UI는 범용으로 만듦
- 로컬 상태에 임시 저장 (아직 서버 전송 X)

#### Step 2: 아바타 외형 선택

**필요 API:**

##### `GET /api/v1/avatars`

아바타 목록 조회

**Response:**
```jsonc
{
  "items": [
    {
      "id": 1,
      "name": "Luna",
      "thumbnail_url": "https://cdn.example.com/avatars/luna.png",
      "primary_color": "#6C63FF",
      "is_active": true
    },
    {
      "id": 2,
      "name": "Mochi",
      "thumbnail_url": "https://cdn.example.com/avatars/mochi.png",
      "primary_color": "#FF6B6B",
      "is_active": true
    }
  ]
}
```

**프론트 처리:**
- 카드 목록으로 표시 (thumbnail_url 이미지 + primary_color 배경)
- 아바타 이름은 i18n 파일에서 번역 키로 매핑 (예: `avatar.luna`)
- 선택된 아바타 로컬 상태에 임시 저장

#### Step 3: 아바타 목소리 선택

**필요 API:**

##### `GET /api/v1/voices?language_id={target_language_id}`

학습 언어에 해당하는 목소리 목록

**Response:**
```jsonc
{
  "items": [
    {
      "id": 1,
      "language_id": 2,
      "name": "Bright Female",
      "gender": "female",
      "tone": "활발한",
      "sample_url": "https://cdn.example.com/voices/bright-female-sample.mp3",
      "description": "밝고 활발한 여성 목소리",
      "is_active": true
    },
    {
      "id": 2,
      "language_id": 2,
      "name": "Calm Male",
      "gender": "male",
      "tone": "차분한",
      "sample_url": "https://cdn.example.com/voices/calm-male-sample.mp3",
      "description": "차분하고 안정적인 남성 목소리",
      "is_active": true
    }
  ]
}
```

**프론트 처리:**
- `[미리듣기]` 버튼 → `sample_url`을 expo-av로 재생
- gender 필터 토글 (전체 / 여성 / 남성)
- 선택된 목소리 로컬 상태에 임시 저장

> ⭐ **`sample_url` 요구사항**: 프론트에서 직접 재생할 수 있는 URL이어야 함 (인증 불필요한 public URL 또는 presigned URL). CDN 직접 URL 권장.

#### Step 4: 아바타 성격 설정

**추가 API 불필요** — 프론트에서 슬라이더 UI로 empathy/intuition/logic 설정. 로컬 상태에 임시 저장.

### 3.3 온보딩 완료 (프로필 저장)

##### `POST /api/v1/user/profile`

Step 1~4에서 수집한 데이터를 한 번에 저장.

**Request:**
```jsonc
{
  "native_language_id": 1,        // 한국어
  "target_language_id": 2,        // 영어
  "avatar_id": 1,                 // Luna
  "avatar_name": "루나",           // 유저가 붙인 커스텀 이름 (nullable)
  "voice_id": 1,                  // Bright Female
  "empathy": 40,                  // 0~100
  "intuition": 30,                // 0~100
  "logic": 30,                    // 0~100
  "app_locale": "ko"              // 앱 UI 언어
}
```

**Response (201 Created):**
```jsonc
{
  "id": 1,
  "user_id": 1,
  "native_language_id": 1,
  "target_language_id": 2,
  "avatar_id": 1,
  "avatar_name": "루나",
  "voice_id": 1,
  "empathy": 40,
  "intuition": 30,
  "logic": 30,
  "app_locale": "ko",
  "onboarding_completed": true,
  "created_at": "2026-02-25T12:00:00Z",
  "updated_at": "2026-02-25T12:00:00Z"
}
```

**에러 응답:**
| HTTP | 코드 | 상황 |
|------|------|------|
| 400 | `VALIDATION_ERROR` | 필수 필드 누락, 성격 합계 ≠ 100 등 |
| 404 | `AVATAR_NOT_FOUND` | 유효하지 않은 avatar_id |
| 404 | `VOICE_NOT_FOUND` | 유효하지 않은 voice_id |
| 409 | `PROFILE_ALREADY_EXISTS` | 이미 프로필 존재 (PUT 사용 유도) |

**프론트 처리:**
```
1. POST /api/v1/user/profile → 프로필 저장 + 온보딩 완료
2. Zustand: onboardingCompleted = true
3. 홈 탭으로 네비게이션
```

---

## 4. 4탭 화면별 필요 API

### 탭 구조 변경: 3탭 → 4탭

```
기존:  홈 | 일기 쓰기 | 히스토리
변경:  홈 | 일기 쓰기 | 히스토리 | 마이페이지
```

### 4.1 탭 1: 홈

#### 화면 요소 → 필요 데이터

| 화면 요소 | 필요 데이터 | 출처 |
|-----------|-----------|------|
| "안녕하세요 {닉네임}님 👋" | 닉네임 | 유저 프로필 |
| "오늘도 {타겟언어} 일기를 써볼까요?" | 학습 언어명 | 유저 프로필 |
| 아바타 이미지 | avatar thumbnail_url, primary_color | 유저 프로필 → 아바타 정보 |
| 아바타 이름 | avatar_name (커스텀) or avatar.name (기본) | 유저 프로필 |
| 최근 일기 목록 | 최근 N개 일기 | 일기 API |

#### 필요 API

##### `GET /api/v1/home` ⭐ 신규 — 홈 대시보드 통합 API

**목적:** 홈 화면에 필요한 모든 데이터를 **단일 API 호출**로 제공 (waterfall 방지)

**Response:**
```jsonc
{
  "user": {
    "nickname": "홍길동",
    "target_language": {
      "id": 2,
      "code": "en",
      "name_native": "English"
    }
  },
  "avatar": {
    "id": 1,
    "name": "Luna",
    "custom_name": "루나",           // 유저가 붙인 이름 (null이면 name 사용)
    "thumbnail_url": "https://cdn.example.com/avatars/luna.png",
    "primary_color": "#6C63FF"
  },
  "recent_diaries": [
    {
      "id": 42,
      "original_text": "오늘 회사에서 프로젝트 미팅을 했다...",
      "translated_text": "I had a project meeting at work today...",
      "status": "completed",
      "created_at": "2026-02-25T08:00:00Z"
    }
  ],
  "stats": {
    "total_diaries": 15,
    "streak_days": 3,                // 연속 학습일
    "today_completed": true          // 오늘 일기 작성 여부
  }
}
```

> **⭐ 프론트 요청**: 홈 화면에서 user profile + avatar + recent diaries + stats를 각각 호출하면 최소 3~4개 API 호출이 필요하다. 단일 `/home` API로 묶어달라.

**대안 (통합 API가 어려울 경우):** 개별 API 병렬 호출

```
Promise.all([
  GET /api/v1/user/profile,
  GET /api/v1/diary?limit=5,
  GET /api/v1/user/stats
])
```

### 4.2 탭 2: 일기 쓰기 (MVP 유지)

기존 MVP API 그대로 사용. **변경 사항: JWT 인증 추가만.**

| API | 변경점 |
|-----|--------|
| `POST /api/v1/conversation` | `Authorization` 헤더 추가 |
| `WS /ws/conversation/{session_id}` | 연결 시 JWT 전달 (query param 또는 첫 메시지) |
| `POST /api/v1/speech/tts` | `Authorization` 헤더 추가. 유저의 voice_id 사용 |
| `POST /api/v1/speech/evaluate` | `Authorization` 헤더 추가 |

#### WebSocket JWT 인증 방식 (협의 필요)

**옵션 A — Query Parameter (권장):**
```
WS /ws/conversation/{session_id}?token=<access_token>
```
- 장점: 간결, 표준 WebSocket 라이브러리 호환
- 단점: URL에 토큰 노출 (서버 로그 주의)

**옵션 B — 첫 메시지:**
```jsonc
// WebSocket 연결 후 첫 메시지
{ "type": "auth", "token": "<access_token>" }
```
- 장점: URL 노출 없음
- 단점: 인증 전 메시지 처리 로직 필요

**프론트 선호: 옵션 A** (구현 간결)

#### TTS voice_id 전달 방식 (협의 필요)

현재 TTS API:
```jsonc
POST /api/v1/speech/tts
{ "text": "Hello world" }
```

Phase 2에서 유저별 voice_id가 생기므로:

**옵션 A — 서버가 유저 프로필에서 자동 조회 (권장):**
- 프론트: 기존과 동일 (text만 전송)
- 서버: JWT에서 user_id 추출 → user_profiles.voice_id 조회 → ElevenLabs 호출

**옵션 B — 프론트가 voice_id 명시:**
```jsonc
POST /api/v1/speech/tts
{ "text": "Hello world", "voice_id": 1 }
```

**프론트 선호: 옵션 A** (프론트 변경 최소화, 유저 설정 반영 자동화)

### 4.3 탭 3: 히스토리 (MVP 유지)

기존 MVP API 그대로 사용. JWT 인증만 추가.

| API | 변경점 |
|-----|--------|
| `GET /api/v1/diary?cursor=&limit=` | `Authorization` 헤더 추가. user_id 자동 필터 |
| `GET /api/v1/diary/{id}` | 본인 일기만 조회 가능 |
| `PUT /api/v1/diary/{id}` | 본인 일기만 수정 가능 |
| `DELETE /api/v1/diary/{id}` | 본인 일기만 삭제 가능 |
| `POST /api/v1/diary/{id}/complete` | 본인 일기만 완료 처리 가능 |

#### 추가 요청: 날짜 범위 필터

히스토리 탭에서 날짜 필터 기능을 향후 추가할 수 있으므로 query parameter 예약 요청:

```
GET /api/v1/diary?cursor=&limit=20&date_from=2026-02-01&date_to=2026-02-28
```

> 당장 구현은 불필요하나, 파라미터 설계 시 고려 요청.

### 4.4 탭 4: 마이페이지 (신규)

#### 화면 구성 → 필요 API

**프로필 조회:**

##### `GET /api/v1/user/profile`

**Response:**
```jsonc
{
  "id": 1,
  "user_id": 1,
  "email": "user@example.com",         // 읽기 전용
  "nickname": "홍길동",
  "social_provider": "google",          // 읽기 전용
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
    "thumbnail_url": "https://cdn.example.com/avatars/luna.png",
    "primary_color": "#6C63FF"
  },
  "avatar_name": "루나",
  "voice": {
    "id": 1,
    "name": "Bright Female",
    "gender": "female",
    "tone": "활발한",
    "sample_url": "https://cdn.example.com/voices/bright-female-sample.mp3"
  },
  "empathy": 40,
  "intuition": 30,
  "logic": 30,
  "language_level": {
    "language_id": 2,
    "cefr_level": "B1"
  },
  "onboarding_completed": true,
  "created_at": "2026-02-25T12:00:00Z",
  "updated_at": "2026-02-25T12:00:00Z"
}
```

> ⭐ **프론트 요청**: 프로필 응답에 `avatar`, `voice`, `native_language`, `target_language`를 **nested object로 포함**시켜달라. 프론트에서 별도 조회 호출을 줄이기 위함.

**프로필 수정:**

##### `PUT /api/v1/user/profile`

마이페이지에서 설정 변경 시 사용.

**Request (부분 업데이트 — Partial Update):**
```jsonc
{
  // 변경할 필드만 전송
  "nickname": "새닉네임",
  "avatar_id": 2,
  "avatar_name": "모찌",
  "voice_id": 2,
  "empathy": 50,
  "intuition": 25,
  "logic": 25,
  "app_locale": "en",
  "native_language_id": 1,
  "target_language_id": 3
}
```

**Response (200 OK):** 업데이트된 전체 프로필 (GET /api/v1/user/profile 형식과 동일)

**프론트 처리:**
- 각 섹션별 저장 버튼 또는 자동 저장 (디바운스)
- 학습 언어 변경 시 voice 목록 다시 조회 필요

**학습 레벨 설정:**

##### `PUT /api/v1/user/language-level`

**Request:**
```jsonc
{
  "language_id": 2,
  "cefr_level": "B2"
}
```

**Response (200 OK):**
```jsonc
{
  "language_id": 2,
  "cefr_level": "B2",
  "updated_at": "2026-02-25T12:00:00Z"
}
```

#### 마이페이지 전체 API 호출 흐름

```
마이페이지 진입
  ↓
GET /api/v1/user/profile  ← 전체 프로필 + nested 정보
  ↓
[아바타 변경] 클릭 → GET /api/v1/avatars → 선택 → PUT /api/v1/user/profile
[목소리 변경] 클릭 → GET /api/v1/voices?language_id=2 → 선택 → PUT /api/v1/user/profile
[성격 변경] 슬라이더 조정 → PUT /api/v1/user/profile
[닉네임 변경] 입력 → PUT /api/v1/user/profile
[언어 변경] 선택 → PUT /api/v1/user/profile (목소리 자동 리셋 필요?)
[학습 레벨] 선택 → PUT /api/v1/user/language-level
[로그아웃] → POST /api/v1/auth/logout
[회원 탈퇴] → DELETE /api/v1/auth/account
```

---

## 5. 공통 요구사항

### 5.1 인증 헤더

Phase 2 이후 **모든 API**에 JWT Bearer token 필수:

```
Authorization: Bearer <access_token>
```

**예외 (인증 불필요):**
- `POST /api/v1/auth/social` — 소셜 로그인
- `POST /api/v1/auth/refresh` — 토큰 갱신
- `GET /health` — 헬스체크

### 5.2 에러 응답 형식 통일

**현재 문제:** FastAPI 기본 에러는 `{"detail": "..."}`, 커스텀 에러는 형식이 다를 수 있음.

**요청: 모든 에러를 아래 형식으로 통일**

```jsonc
{
  "error": {
    "code": "ERROR_CODE",          // 머신 리더블 코드 (대문자 스네이크)
    "message": "사용자에게 보여줄 메시지",  // 한국어 (또는 i18n 코드)
    "detail": "디버그 정보 (선택)"         // 개발 환경에서만
  }
}
```

**Phase 2 추가 에러 코드:**

| 코드 | HTTP | 설명 |
|------|------|------|
| `UNAUTHORIZED` | 401 | 인증 토큰 없음/유효하지 않음 |
| `TOKEN_EXPIRED` | 401 | Access Token 만료 |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh Token 유효하지 않음 |
| `REFRESH_TOKEN_EXPIRED` | 401 | Refresh Token 만료 |
| `FORBIDDEN` | 403 | 권한 없음 (다른 유저 리소스 접근) |
| `INVALID_TOKEN` | 400 | 소셜 토큰 검증 실패 |
| `UNSUPPORTED_PROVIDER` | 400 | 지원하지 않는 소셜 프로바이더 |
| `EMAIL_CONFLICT` | 409 | 이메일 중복 |
| `PROFILE_ALREADY_EXISTS` | 409 | 이미 프로필 존재 |
| `AVATAR_NOT_FOUND` | 404 | 아바타 없음 |
| `VOICE_NOT_FOUND` | 404 | 목소리 없음 |
| `LANGUAGE_NOT_FOUND` | 404 | 언어 없음 |
| `PROFILE_NOT_FOUND` | 404 | 유저 프로필 없음 (온보딩 미완료) |

**프론트 에러 처리 전략:**
```
- 401 → 토큰 갱신 시도 → 실패 시 로그인 화면
- 403 → "접근 권한이 없습니다" 토스트
- 404 → 해당 리소스 없음 처리
- 409 → 충돌 안내
- 422/400 → validation 에러 표시
- 500 → "서버 오류. 잠시 후 다시 시도해주세요" 토스트
```

### 5.3 페이지네이션 방식

**현재 (MVP):** 커서 기반 (diary 목록)  
**Phase 2:** 동일하게 **커서 기반** 유지 (권장)

```jsonc
// Request
GET /api/v1/diary?cursor=50&limit=20

// Response
{
  "items": [...],
  "next_cursor": 30,      // null이면 마지막 페이지
  "has_next": true
}
```

**이유:**
- 무한 스크롤 UI에 최적
- 실시간 데이터 삽입/삭제 시 offset보다 안정적
- MVP에서 이미 사용 중이므로 프론트 변경 최소화

### 5.4 날짜/시간 규칙

- **서버 → 클라이언트**: ISO 8601 UTC (예: `2026-02-25T12:00:00Z`)
- **클라이언트 → 서버**: ISO 8601 UTC
- **타임존 변환**: 클라이언트에서 처리 (사용자 로컬 타임존)

### 5.5 API 버전

- 기존 prefix 유지: `/api/v1/`
- Phase 2 신규 API도 동일 prefix

---

## 6. 프론트엔드 특별 요청 사항

### 6.1 ⭐ 소셜 로그인 응답에 `onboarding_completed` 포함

**이유:** 로그인 직후 온보딩 여부에 따라 라우팅이 갈림. 별도 GET /api/v1/user/profile 호출 없이 바로 결정하고 싶음.

**요청:**
```jsonc
// POST /api/v1/auth/social 응답에 포함
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": 1,
    "onboarding_completed": false  // ← 이 필드 필수
  }
}
```

### 6.2 ⭐ 홈 화면 데이터를 단일 API로 묶어달라

**이유:** 홈 화면 진입 시 user profile + avatar + recent diaries + stats를 각각 호출하면 4개 API waterfall 발생. 체감 로딩 시간 증가.

**요청:** `GET /api/v1/home` 통합 API 제공 (섹션 4.1 참조)

**최소 요구 데이터:**
- 닉네임 + 학습 언어명
- 아바타 정보 (thumbnail_url, primary_color, custom_name)
- 최근 일기 3~5개 (미리보기)
- 기본 통계 (총 일기 수, 연속 학습일, 오늘 완료 여부)

### 6.3 ⭐ 목소리 샘플 URL은 인증 없이 접근 가능해야 함

**이유:** 온보딩/마이페이지에서 목소리 미리듣기 시 `expo-av`로 직접 재생. 인증 헤더를 Audio Player에 주입하기 어려움.

**요청:**
- `voices.sample_url`은 **public CDN URL** 또는 **presigned URL** (유효기간 1시간+)
- 프론트에서 `Audio.Sound.createAsync({ uri: sample_url })` 로 바로 재생 가능해야 함

### 6.4 ⭐ 아바타 썸네일 URL도 인증 없이 접근 가능해야 함

**이유:** `sample_url`과 동일한 이유. `Image` 컴포넌트에서 직접 로딩.

### 6.5 프로필 PUT은 Partial Update 지원

**이유:** 마이페이지에서 닉네임만 바꾸거나 성격만 바꾸는 경우, 전체 프로필을 보내지 않아도 되게.

**요청:** `PUT /api/v1/user/profile`은 전송된 필드만 업데이트 (PATCH 시맨틱)

> PATCH 메서드 사용도 가능하지만, PUT으로 통일하되 partial update 지원이면 충분.

### 6.6 학습 언어 변경 시 voice_id 처리

**질문:** 유저가 학습 언어를 영어→일본어로 변경하면, 기존 영어 voice_id는 유효하지 않게 됨.

**요청:** 서버에서 `target_language_id` 변경 시:
1. 기존 `voice_id`가 새 언어에 유효한지 확인
2. 유효하지 않으면 `voice_id`를 `null`로 리셋 (또는 해당 언어 기본 목소리로 자동 설정)
3. 응답에 `voice_reset: true` 플래그로 알려주기

```jsonc
// PUT /api/v1/user/profile 응답
{
  // ... 프로필 ...
  "voice_reset": true,   // voice가 리셋되었음
  "voice": null           // 새 목소리 선택 필요
}
```

---

## 7. API 엔드포인트 총 정리

### 신규 API (Phase 2)

| 메서드 | 엔드포인트 | 인증 | 설명 |
|--------|-----------|------|------|
| POST | `/api/v1/auth/social` | ❌ | 소셜 로그인 + JWT 발급 |
| POST | `/api/v1/auth/refresh` | ❌ | Access Token 갱신 |
| POST | `/api/v1/auth/logout` | ✅ | 로그아웃 (refresh token 폐기) |
| DELETE | `/api/v1/auth/account` | ✅ | 회원 탈퇴 (소프트 삭제) |
| GET | `/api/v1/home` | ✅ | 홈 대시보드 통합 데이터 |
| GET | `/api/v1/user/profile` | ✅ | 내 프로필 조회 (nested 관계 포함) |
| POST | `/api/v1/user/profile` | ✅ | 프로필 생성 (온보딩 완료) |
| PUT | `/api/v1/user/profile` | ✅ | 프로필 수정 (partial update) |
| PUT | `/api/v1/user/language-level` | ✅ | 학습 레벨 변경 |
| GET | `/api/v1/languages` | ✅ | 언어 목록 |
| GET | `/api/v1/avatars` | ✅ | 아바타 목록 |
| GET | `/api/v1/voices` | ✅ | 목소리 목록 (?language_id= 필터) |

### 기존 API (변경: JWT 인증 추가)

| 메서드 | 엔드포인트 | 인증 | 변경점 |
|--------|-----------|------|--------|
| POST | `/api/v1/conversation` | ✅ | `Authorization` 헤더 추가 |
| GET | `/api/v1/conversation/{session_id}` | ✅ | `Authorization` 헤더 추가 |
| WS | `/ws/conversation/{session_id}` | ✅ | JWT 전달 방식 협의 필요 |
| GET | `/api/v1/diary` | ✅ | user_id 자동 필터 |
| GET | `/api/v1/diary/{id}` | ✅ | 본인 소유 검증 |
| PUT | `/api/v1/diary/{id}` | ✅ | 본인 소유 검증 |
| DELETE | `/api/v1/diary/{id}` | ✅ | 본인 소유 검증 |
| POST | `/api/v1/diary/{id}/complete` | ✅ | 본인 소유 검증 |
| POST | `/api/v1/speech/tts` | ✅ | 유저 voice_id 자동 적용 |
| POST | `/api/v1/speech/evaluate` | ✅ | `Authorization` 헤더 추가 |

### 변경 없는 API

| 메서드 | 엔드포인트 | 인증 | 비고 |
|--------|-----------|------|------|
| GET | `/health` | ❌ | 헬스체크 |

---

## 8. 마이그레이션 계획

### 프론트 영향도 분석

| 파일 | 변경 범위 | 설명 |
|------|----------|------|
| `api.ts` | 🔴 대규모 | 토큰 인터셉터 추가, 신규 API 함수, 401 처리 |
| `types/index.ts` | 🔴 대규모 | User, Profile, Language, Voice 등 타입 추가 |
| `(tabs)/_layout.tsx` | 🟡 중간 | 4탭 구조 + 인증 가드 |
| `(tabs)/index.tsx` | 🟡 중간 | 홈 API 통합 + 개인화 인사말 |
| `(tabs)/write.tsx` | 🟢 소규모 | JWT 헤더 추가만 |
| `(tabs)/history.tsx` | 🟢 소규모 | JWT 헤더 추가만 |
| `stores/` | 🔴 대규모 | useAuthStore, useProfileStore 신규 + 기존 스토어 인증 연동 |
| `services/avatarApi.ts` | 🟡 중간 | mock → 실제 API 교체 |
| **신규 파일** | | |
| `(tabs)/mypage.tsx` | 🔴 신규 | 마이페이지 탭 |
| `app/login.tsx` | 🔴 신규 | 로그인 화면 |
| `app/onboarding/` | 🔴 신규 | 온보딩 4단계 화면 |
| `stores/useAuthStore.ts` | 🔴 신규 | 인증 상태 관리 |
| `stores/useProfileStore.ts` | 🔴 신규 | 유저 프로필 상태 관리 |
| `services/authApi.ts` | 🔴 신규 | 인증 API 서비스 |
| `utils/tokenManager.ts` | 🔴 신규 | JWT 저장/갱신/인터셉터 |

### 구현 순서 (프론트 기준)

```
Phase 2-1: 인프라 (인증 기반)
  ├── tokenManager (SecureStore + interceptor)
  ├── useAuthStore (로그인 상태 관리)
  ├── api.ts 리팩토링 (Authorization 헤더 자동 추가)
  └── 인증 가드 (tabs layout)

Phase 2-2: 로그인 + 온보딩
  ├── 로그인 화면 (Google/Apple 버튼)
  ├── 온보딩 Step 1~4 화면
  ├── useProfileStore
  └── POST /api/v1/user/profile 연동

Phase 2-3: 홈 개편 + 마이페이지
  ├── 홈 탭 개편 (GET /api/v1/home 연동)
  ├── 마이페이지 탭 신규
  ├── 프로필 수정 UI
  └── 4탭 _layout 변경

Phase 2-4: 기존 탭 인증 적용
  ├── 일기 쓰기 (WebSocket JWT)
  ├── 히스토리 (JWT 헤더)
  └── 아바타 mock → 실제 API 전환
```

---

## 부록: 백엔드에 확인/협의 필요한 사항

| # | 질문 | 프론트 선호 |
|---|------|-----------|
| 1 | WebSocket JWT 전달: query param vs 첫 메시지? | query param |
| 2 | TTS voice_id: 서버 자동 조회 vs 프론트 전달? | 서버 자동 조회 |
| 3 | 학습 언어 변경 시 voice_id 리셋 정책? | 서버에서 자동 리셋 + 알림 |
| 4 | `/api/v1/home` 통합 API 제공 가능? | 강력 요청 |
| 5 | `sample_url`, `thumbnail_url` public 접근 가능? | 필수 |
| 6 | Refresh Token 로테이션 적용? | 적용 권장 (보안) |
| 7 | `PUT /api/v1/user/profile` partial update? | 필수 |
| 8 | 에러 응답 형식 통일 (`{error: {code, message}}`)? | 필수 |
| 9 | 날짜 범위 필터 (`date_from`, `date_to`) 예약? | 권장 |
| 10 | 온보딩 성격 슬라이더: 합계 100 강제 vs 자유? | 합계 100 (서버 validation) |
