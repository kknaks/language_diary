# Plan: Live2D → Rive 전환

## 현재 상태 (Live2D)

### 아키텍처
- `react-native-webview` 안에서 Pixi.js + Live2D Cubism SDK로 렌더링
- HTML 렌더러: `frontend/assets/live2d/index.html` (self-contained)
- React Native ↔ WebView 간 `postMessage` JSON 통신

### 사용 중인 기술 스택
| 라이브러리 | 버전 | 로딩 방식 |
|-----------|------|----------|
| Live2D Cubism Core | latest | CDN |
| Pixi.js | 6.5.10 | CDN |
| pixi-live2d-display | 0.4.0 | CDN |
| react-native-webview | 13.15.0 | npm |

### 모델 파일 구조
```
backend/static/models/mark/
├── mark_free_t04.model3.json   # 모델 정의
├── mark_free_t04.moc3          # 바이너리 모델
├── mark_free_t04.physics3.json # 물리 시뮬레이션
├── mark_free_t04.cdi3.json     # 파라미터 정보 (21개)
├── mark_free_t04.2048/
│   └── texture_00.png          # 텍스처
└── motion/                     # 모션 6개 (미사용)
```

### 현재 구현된 기능
- 숨쉬기 (ParamBreath, sine wave)
- 눈깜빡임 (ParamEyeLOpen/ROpen, 상태별 빈도 조절)
- 립싱크 (ParamMouthOpenY, 볼륨 기반)
- 폴백 렌더링 (모델 로드 실패 시 Canvas 기반 원형 아바타)

### 미사용 기능
- 모션 재생 (motion 파일 6개 존재하나 트리거 없음)
- 탭/클릭 인터랙션
- 물리 시뮬레이션 (physics3.json 존재하나 비활성)
- 표정 시스템
- 헤어/팔 움직임

### 사용 화면 (4곳)
1. **홈 화면** `/(tabs)/index.tsx` — idle 상태 표시
2. **대화 화면** `/(tabs)/write.tsx` — 실시간 voiceState/volume 반영
3. **아바타 선택** `/onboarding/step2-avatar.tsx` — 미리보기
4. **음성 선택** `/onboarding/step3-voice.tsx` — 음성 샘플 재생 시 볼륨 시각화

---

## 전환 이유

### 성능
- 현재: WebView 내부 렌더링 → 오버헤드
- Rive: `rive-react-native`로 네이티브 렌더링 가능

### 번들 크기
- 현재: Live2D SDK + Pixi.js CDN 런타임 로딩
- Rive: 경량 런타임, CDN 불필요

### 라이선스
- Live2D: 상업적 사용 시 라이선스 비용 발생
- Rive: 오픈소스 런타임, 에디터 무료

### 개발 생산성
- Rive State Machine으로 상태 전환을 선언적 관리
- 인터랙션(터치/드래그) 쉽게 추가 가능
- 커스텀 캐릭터를 Rive Editor(무료)에서 직접 제작

---

## 전환 계획

### Phase 1: Rive 캐릭터 제작
- [ ] Rive Editor에서 캐릭터 디자인 및 리깅
- [ ] State Machine 구성:

| State | 용도 | 애니메이션 |
|-------|------|-----------|
| idle | 대기 | 숨쉬기 + 눈깜빡임 |
| listening | 유저 발화 중 | 눈깜빡임 빈도 증가 |
| ai_speaking | AI 응답 중 | 립싱크 (볼륨 연동) |

- [ ] State Machine Inputs:

| Input | 타입 | 용도 |
|-------|------|------|
| voiceState | Number (0/1/2) | 상태 전환 트리거 |
| volume | Number (0~1) | 립싱크 입 크기 |

- [ ] `.riv` 파일 export

### Phase 2: 프론트엔드 연동
- [ ] `rive-react-native` 패키지 설치
- [ ] `RiveAvatar` 컴포넌트 생성 (Live2DAvatar 대체)
  - Props 인터페이스 동일 유지: `voiceState`, `volume`, `color`, `modelUrl`
  - State Machine input 바인딩
- [ ] `.riv` 파일을 `frontend/assets/rive/` 에 배치

### Phase 3: 기존 Live2D 교체
- [ ] 4개 화면에서 `Live2DAvatar` → `RiveAvatar` 교체
- [ ] `avatars.json` seed 데이터 업데이트 (model_url → `.riv` 경로)
- [ ] 동작 검증 (idle, listening, ai_speaking 상태 전환)

### Phase 4: 정리
- [ ] Live2D 관련 파일 삭제
  - `frontend/assets/live2d/index.html`
  - `frontend/src/components/conversation/Live2DAvatar.tsx`
  - `backend/static/models/mark/` (Live2D 모델 파일)
- [ ] `react-native-webview` 의존성 제거 (다른 곳에서 미사용 시)
- [ ] Pixi.js, Live2D CDN 참조 제거

---

## 관련 파일 목록

### 수정 대상
| 파일 | 변경 내용 |
|------|----------|
| `frontend/src/components/conversation/Live2DAvatar.tsx` | RiveAvatar로 교체 |
| `frontend/src/components/conversation/index.ts` | export 변경 |
| `frontend/app/(tabs)/index.tsx` | 컴포넌트 import 변경 |
| `frontend/app/(tabs)/write.tsx` | 컴포넌트 import 변경 |
| `frontend/app/onboarding/step2-avatar.tsx` | 컴포넌트 import 변경 |
| `frontend/app/onboarding/step3-voice.tsx` | 컴포넌트 import 변경 |
| `backend/seeds/avatars.json` | model_url을 .riv 경로로 변경 |
| `package.json` | rive-react-native 추가, webview 제거 검토 |

### 삭제 대상
| 파일 | 사유 |
|------|------|
| `frontend/assets/live2d/index.html` | Live2D 렌더러 불필요 |
| `backend/static/models/mark/*` | Live2D 모델 파일 불필요 |

### 신규 생성
| 파일 | 내용 |
|------|------|
| `frontend/assets/rive/*.riv` | Rive 캐릭터 파일 |
| `frontend/src/components/conversation/RiveAvatar.tsx` | Rive 아바타 컴포넌트 |
