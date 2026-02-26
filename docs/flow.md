[1] 대화 시작 → [2] 대화 루프 (턴 반복) → [3] 대화 종료 & 일기 생성

  ---
  1. 대화 시작

  WebSocket 연결: GET /ws/conversation?token=<JWT>
  - backend/app/api/v1/conversation.py:328-441

  1. JWT 인증
  2. WebSocket accept
  3. DB에 세션 생성
  4. AI 첫 인사 생성 → AIService.get_first_message() 호출
  5. TTS로 음성 변환 후 클라이언트에 전송
  6. STT WebSocket 세션 오픈

  ---
  2. 대화 루프 (핵심)

  메시지 처리: conversation.py:120-325 (_handle_ai_reply_streaming)

  사용자 음성 → STT(ElevenLabs) → 텍스트 변환
    ↓
  ConversationService.handle_user_message_streaming()
    ├─ DB에 사용자 메시지 저장
    ├─ 대화 히스토리 빌드
    ├─ MAX_TURNS(10) 체크
    └─ AIService.get_reply_streaming(history) 호출
         ↓
    문장 단위로 스트리밍 → 클라이언트에 전송 + TTS 변환

  ---
  3. 프롬프트 (수정할 핵심 파일)

  파일: backend/app/services/ai_service.py

  ┌────────────────────────────┬────────────┬───────────────────────────┐
  │          프롬프트          │    위치    │           용도            │
  ├────────────────────────────┼────────────┼───────────────────────────┤
  │ SYSTEM_PROMPT_CONVERSATION │ 라인 18-29 │ 대화 시스템 프롬프트      │
  ├────────────────────────────┼────────────┼───────────────────────────┤
  │ SYSTEM_PROMPT_DIARY        │ 라인 31-43 │ 일기 생성 프롬프트        │
  ├────────────────────────────┼────────────┼───────────────────────────┤
  │ SYSTEM_PROMPT_LEARNING     │ 라인 45-64 │ 학습 포인트 추출 프롬프트 │
  └────────────────────────────┴────────────┴───────────────────────────┘

  현재 대화 프롬프트 (라인 18-29):
  너는 사용자의 친근한 친구야. 한국어로 대화하고,
  친근한 말투, 공감 + 후속 질문, 한 번에 질문 하나,
  [silence] 처리 등의 규칙이 설정되어 있음

  모델: gpt-4o-mini (라인 198-217의 _chat 메서드)

  ---
  4. 대화 종료 → 일기 생성

  사용자가 {"type": "finish"} 전송 시:
  - ConversationService.finish_conversation() (conversation_service.py:216-309)
    a. SYSTEM_PROMPT_DIARY로 한국어 일기 + 영어 번역 생성
    b. SYSTEM_PROMPT_LEARNING으로 학습 카드 추출
    c. DB 저장 후 클라이언트에 결과 전송

  ---
  프롬프트를 수정하려면 backend/app/services/ai_service.py 파일의 상단 상수들을
  수정하면 됩니다. 어떤 프롬프트를 어떻게 바꾸고 싶은지 알려주세요!