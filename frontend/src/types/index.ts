// ===== 아바타 =====
export interface Avatar {
  id: string;
  name: string;
  thumbnailUrl: string;
  modelUrl: string;        // 나중에 Live2D .moc3 URL
  primaryColor: string;    // placeholder 렌더링 색상
}

// ===== 사용자 =====
export interface User {
  id: string;
  email: string;
  name: string;
  nativeLanguage: string;
  targetLanguage: string;
  level: string;
}

// ===== 일기 =====
export interface Diary {
  id: number;
  user_id: number;
  original_text: string;
  translated_text: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  learning_cards: LearningCard[];
}

export interface LearningCard {
  id: number;
  card_type: string;
  content_en: string;
  content_ko: string;
  part_of_speech: string | null;
  cefr_level: string | null;
  example_en: string | null;
  example_ko: string | null;
  card_order: number;
}

// ===== 대화 =====
export interface Conversation {
  id: string;
  userId: string;
  status: 'active' | 'completed';
  turnCount: number;
  maxTurns: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  audioUrl?: string;
  createdAt: string;
}

// ===== API =====
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  next_cursor: number | null;
  has_next: boolean;
}

// ===== Diary status (PRD 기반) =====
export type DiaryStatus = string;

// ===== Conversation status =====
export type ConversationStatus = 'created' | 'active' | 'summarizing' | 'completed' | 'expired';

// ===== WebSocket 연결 상태 =====
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// ===== 대화 세션 생성 응답 =====
export interface ConversationSession {
  sessionId: string;
  status: string;
  firstMessage: string;
  createdAt: string;
}

// ===== WebSocket 메시지 (클라이언트 → 서버) =====
export type ClientMessage =
  | { type: 'message'; text: string }
  | { type: 'audio_start' }
  | { type: 'audio_end' }
  | { type: 'barge_in' }
  | { type: 'finish' };

// ===== TTS 응답 =====
export interface TtsResponse {
  audioUrl: string;
  text?: string;
  cached?: boolean;
  durationMs?: number;
}

// ===== 발음 평가 결과 =====
export interface PronunciationResult {
  overallScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  feedback: string;
}

// ===== WebSocket 메시지 (서버 → 클라이언트) =====
export type ServerMessage =
  | { type: 'session_created'; session_id: string }
  | { type: 'stt_interim'; text: string }
  | { type: 'stt_final'; text: string }
  | { type: 'ai_message'; text: string }
  | { type: 'ai_message_chunk'; text: string; index: number; is_final: boolean }
  | { type: 'ai_done' }
  | { type: 'tts_audio'; audio_data: string; format?: string; index?: number }
  | { type: 'diary_created'; diary: Diary }
  | { type: 'stt_empty'; message: string }
  | { type: 'barge_in_ack' }
  | { type: 'error'; code: string; message: string };
