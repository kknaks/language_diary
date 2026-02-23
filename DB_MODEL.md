# Language Diary — DB 모델 설계

## ERD 개요

```
users (1) ──→ (N) diaries (1) ──→ (N) learning_cards (1) ──→ (N) pronunciation_results
```

## 테이블 정의

### 1. users
테스트용 사용자 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 사용자 ID |
| nickname | VARCHAR(50) | 닉네임 |
| native_lang | VARCHAR(10) | 모국어 (기본: ko) |
| target_lang | VARCHAR(10) | 학습 언어 (기본: en) |
| created_at | TIMESTAMP | 생성일 |

### 2. diaries
일기 (한국어 원문 + 영어 번역)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 일기 ID |
| user_id | INT FK → users.id | 작성자 |
| original_text | TEXT | 한국어 원문 |
| translated_text | TEXT | 영어 번역문 |
| status | VARCHAR(20) | 상태 (draft / translated / completed) |
| created_at | TIMESTAMP | 작성일 |
| completed_at | TIMESTAMP | 학습 완료일 |

### 3. learning_cards
학습 포인트 카드 (단어 또는 구문)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 카드 ID |
| diary_id | INT FK → diaries.id | 소속 일기 |
| card_type | VARCHAR(10) | 타입: word / phrase |
| content_en | VARCHAR(500) | 영어 단어/구문 |
| content_ko | VARCHAR(500) | 한국어 뜻 |
| part_of_speech | VARCHAR(20) | 품사 (단어만) |
| cefr_level | VARCHAR(5) | CEFR 등급 (A1~C2) |
| example_en | TEXT | 영어 예문 (일기 문맥) |
| example_ko | TEXT | 한국어 예문 해석 |
| card_order | INT | 카드 순서 |
| created_at | TIMESTAMP | 생성일 |

### 4. pronunciation_results
카드별 발음 평가 결과

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | SERIAL PK | 결과 ID |
| card_id | INT FK → learning_cards.id | 대상 카드 |
| user_id | INT FK → users.id | 사용자 |
| audio_url | VARCHAR(500) | 녹음 파일 경로 |
| accuracy_score | FLOAT | 정확도 점수 (0~100) |
| fluency_score | FLOAT | 유창성 점수 (0~100) |
| completeness_score | FLOAT | 완성도 점수 (0~100) |
| overall_score | FLOAT | 종합 점수 (0~100) |
| feedback | TEXT | AI 피드백 (음소별 분석) |
| created_at | TIMESTAMP | 평가일 |

## 인덱스

```sql
-- 사용자별 일기 조회
CREATE INDEX idx_diaries_user_id ON diaries(user_id);
CREATE INDEX idx_diaries_created_at ON diaries(created_at DESC);

-- 일기별 학습 카드 조회
CREATE INDEX idx_learning_cards_diary_id ON learning_cards(diary_id);

-- 카드별 발음 결과 조회
CREATE INDEX idx_pronunciation_results_card_id ON pronunciation_results(card_id);
CREATE INDEX idx_pronunciation_results_user_id ON pronunciation_results(user_id);
```

## DDL

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    native_lang VARCHAR(10) NOT NULL DEFAULT 'ko',
    target_lang VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE diaries (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    original_text TEXT NOT NULL,
    translated_text TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE TABLE learning_cards (
    id SERIAL PRIMARY KEY,
    diary_id INT NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
    card_type VARCHAR(10) NOT NULL CHECK (card_type IN ('word', 'phrase')),
    content_en VARCHAR(500) NOT NULL,
    content_ko VARCHAR(500) NOT NULL,
    part_of_speech VARCHAR(20),
    cefr_level VARCHAR(5),
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
    accuracy_score FLOAT,
    fluency_score FLOAT,
    completeness_score FLOAT,
    overall_score FLOAT,
    feedback TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 테스트 유저 삽입
INSERT INTO users (nickname) VALUES ('test_user');
```
