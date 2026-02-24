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
  id: string;
  userId: string;
  titleKo: string;
  titleEn: string;
  contentKo: string;
  contentEn: string;
  status: 'draft' | 'completed' | 'learning_done';
  learningCards: LearningCard[];
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LearningCard {
  id: string;
  type: 'word' | 'phrase' | 'sentence';
  english: string;
  korean: string;
  example: string;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  partOfSpeech?: string;
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
  data: T[];
  cursor?: string;
  hasMore: boolean;
}

// ===== Diary status (PRD 기반) =====
export type DiaryStatus = 'draft' | 'completed' | 'learning_done';

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
  | { type: 'stt_interim'; text: string }
  | { type: 'stt_final'; text: string }
  | { type: 'ai_message'; text: string }
  | { type: 'diary_created'; diary: Diary }
  | { type: 'error'; code: string; message: string };
