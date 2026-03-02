# i18n 작업 TODO

## 전략
- Static 데이터(cefr_levels, languages, voices, avatars)는 **프론트 상수 파일에서 매핑 관리**
- API 응답의 `name`, `description` 등 표시값을 직접 렌더링하지 말 것
- id/code 기반으로 상수에서 꺼내 렌더링할 것

## 작업 방법
1. `src/constants/mappings.ts` 생성
   ```typescript
   export const CEFR_MAP = { A1: { group: '초급', name: '입문', description: '...' }, ... }
   export const LANGUAGE_MAP = { 1: { name: '한국어', flag: '🇰🇷' }, ... }
   export const VOICE_TONE_MAP = { warm: '따뜻한', ... }
   ```

2. 교체 대상 파일 (나중에 한 페이지씩 처리)
   - `app/onboarding/step5-level.tsx` — level.group, level.name, level.description
   - `app/onboarding/step3-voice.tsx` — voice.description
   - `app/(tabs)/mypage.tsx` — cefr_level 표시, language 표시
   - `app/diary/[id].tsx` — CefrBadge

## 규칙
```typescript
// ❌ 금지
<Text>{cefrLevel.name}</Text>

// ✅ 권장
<Text>{CEFR_MAP[cefrLevel.code].name}</Text>
```

## 목표 지원 언어
ko, en, ja, zh, es (5개)
