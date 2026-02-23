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

// ===== 네비게이션 =====
export type RootTabParamList = {
  Home: undefined;
  Write: undefined;
  History: undefined;
};

export type RootStackParamList = {
  Main: undefined;
  DiaryDetail: { diaryId: string };
  Learning: { diaryId: string };
  ConversationDetail: { conversationId: string };
};
