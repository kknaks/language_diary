# Language Diary — DB 모델 설계

## ERD 개요

```
users (1) ──→ (N) conversation_sessions (1) ──→ (N) conversation_messages
                                             └──→ (1) diaries (1) ──→ (N) learning_cards (1) ──→ (N) pronunciation_results
                                                                                                └──→ tts_cache (독립)
```

## 테이블 정의

### 1. users

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 사용자 ID |
| email | VARCHAR(255) UNIQUE | 이메일 (로그인용) — **Phase 2: JWT 인증 시 NOT NULL** |
| password_hash | VARCHAR(255) | bcrypt 해싱된 비밀번호 — **Phase 2: JWT 인증 시 NOT NULL** |
| nickname | VARCHAR(50) NOT NULL | 닉네임 |
| native_lang | VARCHAR(10) DEFAULT 'ko' | 모국어 |
| target_lang | VARCHAR(10) DEFAULT 'en' | 학습 언어 |
| is_active | BOOLEAN DEFAULT true | 활성 상태 |
| created_at | TIMESTAMP DEFAULT NOW() | 생성일 |
| updated_at | TIMESTAMP DEFAULT NOW() | 수정일 |

### 2. conversation_sessions

AI 대화 세션 관리 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | VARCHAR(50) PK | 세션 ID (예: conv_abc123) |
| user_id | INT FK → users.id | 사용자 |
| diary_id | INT FK → diaries.id | 생성된 일기 (대화 완료 후 연결) |
| status | VARCHAR(20) NOT NULL DEFAULT 'created' | 세션 상태 |
| turn_count | INT NOT NULL DEFAULT 0 | 현재 대화 턴 수 |
| created_at | TIMESTAMP DEFAULT NOW() | 생성일 |
| updated_at | TIMESTAMP DEFAULT NOW() | 수정일 |
| completed_at | TIMESTAMP | 완료일 |
| expired_at | TIMESTAMP | 만료일 |

**status 값:** `created` → `active` → `summarizing` → `completed` / `expired`

### 3. conversation_messages

대화 메시지 기록 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 메시지 ID |
| session_id | VARCHAR(50) FK → conversation_sessions.id | 소속 세션 |
| role | VARCHAR(10) NOT NULL | `ai` / `user` |
| content | TEXT NOT NULL | 메시지 내용 |
| message_order | INT NOT NULL | 메시지 순서 |
| created_at | TIMESTAMP DEFAULT NOW() | 생성일 |

### 4. diaries

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 일기 ID |
| user_id | INT FK → users.id | 작성자 |
| original_text | TEXT NOT NULL | 한국어 원문 (AI가 대화 종합하여 생성) |
| translated_text | TEXT | 영어 번역문 |
| status | VARCHAR(20) NOT NULL DEFAULT 'draft' | 상태 |
| created_at | TIMESTAMP DEFAULT NOW() | 작성일 |
| updated_at | TIMESTAMP DEFAULT NOW() | 수정일 |
| completed_at | TIMESTAMP | 학습 완료일 |
| deleted_at | TIMESTAMP | 소프트 삭제일 (NULL이면 활성) |

**status 값:** `draft` → `translated` → `completed`

### 5. learning_cards

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 카드 ID |
| diary_id | INT FK → diaries.id ON DELETE CASCADE | 소속 일기 |
| card_type | VARCHAR(10) NOT NULL | `word` / `phrase` / `sentence` |
| content_en | TEXT NOT NULL | 영어 단어/구문/문장 |
| content_ko | TEXT NOT NULL | 한국어 뜻 |
| part_of_speech | VARCHAR(20) | 품사 (word 타입만) |
| cefr_level | VARCHAR(5) | CEFR 등급 (A1~C2) |
| example_en | TEXT | 영어 예문 (일기 문맥) |
| example_ko | TEXT | 한국어 예문 해석 |
| card_order | INT NOT NULL DEFAULT 0 | 카드 순서 |
| created_at | TIMESTAMP DEFAULT NOW() | 생성일 |

**card_type 설명:**
- `word`: 개별 단어
- `phrase`: 구문/표현 (예: "grab lunch with")
- `sentence`: 번역문 전체 따라 말하기용

### 6. pronunciation_results

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 결과 ID |
| card_id | INT FK → learning_cards.id ON DELETE CASCADE | 대상 카드 |
| user_id | INT FK → users.id | 사용자 |
| audio_url | VARCHAR(500) | 녹음 파일 경로 |
| accuracy_score | NUMERIC(5,2) | 정확도 점수 (0~100) |
| fluency_score | NUMERIC(5,2) | 유창성 점수 (0~100) |
| completeness_score | NUMERIC(5,2) | 완성도 점수 (0~100) |
| overall_score | NUMERIC(5,2) | 종합 점수 (0~100) |
| feedback | TEXT | AI 피드백 (음소별 분석) |
| attempt_number | INT NOT NULL DEFAULT 1 | 시도 횟수 |
| created_at | TIMESTAMP DEFAULT NOW() | 평가일 |

### 7. tts_cache
TTS 비용 절감을 위한 캐시 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 캐시 ID |
| text_hash | VARCHAR(64) UNIQUE NOT NULL | 텍스트 SHA-256 해시 |
| text | TEXT NOT NULL | 원본 텍스트 |
| audio_url | VARCHAR(500) NOT NULL | 생성된 오디오 파일 경로 |
| voice_id | VARCHAR(50) | ElevenLabs voice ID |
| duration_ms | INT | 오디오 길이 (밀리초) |
| created_at | TIMESTAMP DEFAULT NOW() | 생성일 |

## MVP 시드 데이터

```sql
-- MVP: 하드코딩 유저 1명 (인증 없이 동작)
INSERT INTO users (id, nickname, native_lang, target_lang)
VALUES (1, 'MVP User', 'ko', 'en');
```

## 인덱스

```sql
-- 인증
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- 사용자별 대화 세션 조회 (최신순)
CREATE INDEX idx_conversation_sessions_user ON conversation_sessions(user_id, created_at DESC);

-- 세션별 메시지 조회 (순서대로)
CREATE INDEX idx_conversation_messages_session ON conversation_messages(session_id, message_order);

-- 사용자별 일기 조회 (최신순)
CREATE INDEX idx_diaries_user_created ON diaries(user_id, created_at DESC);

-- 소프트 삭제 필터링
CREATE INDEX idx_diaries_deleted_at ON diaries(deleted_at) WHERE deleted_at IS NULL;

-- 일기별 학습 카드 조회
CREATE INDEX idx_learning_cards_diary_id ON learning_cards(diary_id);

-- 카드별 발음 결과 조회
CREATE INDEX idx_pronunciation_results_card_id ON pronunciation_results(card_id);
CREATE INDEX idx_pronunciation_results_user_id ON pronunciation_results(user_id);

-- TTS 캐시 조회
CREATE UNIQUE INDEX idx_tts_cache_text_hash ON tts_cache(text_hash);
```

## DDL

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    nickname VARCHAR(50) NOT NULL,
    native_lang VARCHAR(10) NOT NULL DEFAULT 'ko',
    target_lang VARCHAR(10) NOT NULL DEFAULT 'en',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE diaries (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    original_text TEXT NOT NULL,
    translated_text TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'translated', 'completed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE conversation_sessions (
    id VARCHAR(50) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    diary_id INT REFERENCES diaries(id),
    status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'active', 'summarizing', 'completed', 'expired')),
    turn_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    expired_at TIMESTAMP
);

CREATE TABLE conversation_messages (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(50) NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL CHECK (role IN ('ai', 'user')),
    content TEXT NOT NULL,
    message_order INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE learning_cards (
    id SERIAL PRIMARY KEY,
    diary_id INT NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    card_type VARCHAR(10) NOT NULL CHECK (card_type IN ('word', 'phrase', 'sentence')),
    content_en TEXT NOT NULL,
    content_ko TEXT NOT NULL,
    part_of_speech VARCHAR(20),
    cefr_level VARCHAR(5) CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    example_en TEXT,
    example_ko TEXT,
    card_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE pronunciation_results (
    id SERIAL PRIMARY KEY,
    card_id INT NOT NULL REFERENCES learning_cards(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id),
    audio_url VARCHAR(500),
    accuracy_score NUMERIC(5,2),
    fluency_score NUMERIC(5,2),
    completeness_score NUMERIC(5,2),
    overall_score NUMERIC(5,2),
    feedback TEXT,
    attempt_number INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE tts_cache (
    id SERIAL PRIMARY KEY,
    text_hash VARCHAR(64) UNIQUE NOT NULL,
    text TEXT NOT NULL,
    audio_url VARCHAR(500) NOT NULL,
    voice_id VARCHAR(50),
    duration_ms INT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_conversation_sessions_user ON conversation_sessions(user_id, created_at DESC);
CREATE INDEX idx_conversation_messages_session ON conversation_messages(session_id, message_order);
CREATE INDEX idx_diaries_user_created ON diaries(user_id, created_at DESC);
CREATE INDEX idx_diaries_deleted_at ON diaries(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_learning_cards_diary_id ON learning_cards(diary_id);
CREATE INDEX idx_pronunciation_results_card_id ON pronunciation_results(card_id);
CREATE INDEX idx_pronunciation_results_user_id ON pronunciation_results(user_id);
```
