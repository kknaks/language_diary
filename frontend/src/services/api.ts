import { Diary, LearningCard, Message, PaginatedResponse, ConversationSession, TtsResponse, PronunciationResult } from '../types';
import { env } from '../config/env';
import { debugFetch } from '../components/common/DebugBanner';

const API_BASE_URL = env.API_BASE_URL;

// ===== Error handling =====

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse(res: Response): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

// ===== Adapters: backend (snake_case) → frontend (camelCase) =====

function extractTitle(text: string | null | undefined, maxLen = 30): string {
  if (!text) return '';
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length <= maxLen) return firstLine;
  return firstLine.slice(0, maxLen) + '…';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptLearningCard(raw: any): LearningCard {
  return {
    id: String(raw.id),
    type: raw.card_type ?? 'word',
    english: raw.content_en ?? '',
    korean: raw.content_ko ?? '',
    example: raw.example_en ?? '',
    cefrLevel: raw.cefr_level ?? 'A2',
    partOfSpeech: raw.part_of_speech ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adaptDiary(raw: any): Diary {
  const cards: LearningCard[] = Array.isArray(raw.learning_cards)
    ? raw.learning_cards.map(adaptLearningCard)
    : [];

  return {
    id: String(raw.id),
    userId: String(raw.user_id),
    titleKo: extractTitle(raw.original_text),
    titleEn: extractTitle(raw.translated_text),
    contentKo: raw.original_text ?? '',
    contentEn: raw.translated_text ?? '',
    status: raw.status ?? 'draft',
    learningCards: cards,
    conversationId: raw.conversation_id ? String(raw.conversation_id) : undefined,
    createdAt: raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function adaptMessage(raw: any, conversationId: string): Message {
  return {
    id: String(raw.id),
    conversationId,
    role: raw.role,
    content: raw.content ?? '',
    createdAt: raw.created_at ?? new Date().toISOString(),
  };
}

// ===== Diary API =====

export async function getDiaries(cursor?: string, limit: number = 20): Promise<PaginatedResponse<Diary>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary?${params}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await handleResponse(res) as any;

  return {
    data: Array.isArray(json.items) ? json.items.map(adaptDiary) : [],
    cursor: json.next_cursor != null ? String(json.next_cursor) : undefined,
    hasMore: json.has_next ?? false,
  };
}

export async function getDiary(id: string): Promise<Diary> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}`);
  const json = await handleResponse(res);
  return adaptDiary(json);
}

export async function deleteDiary(id: string): Promise<void> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}`, { method: 'DELETE' });
  await handleResponse(res);
}

export async function updateDiary(id: string, data: Partial<Diary>): Promise<Diary> {
  // Convert frontend field names → backend field names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {};
  if (data.contentKo !== undefined) body.original_text = data.contentKo;
  if (data.contentEn !== undefined) body.translated_text = data.contentEn;

  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await handleResponse(res);
  return adaptDiary(json);
}

// ===== Conversation API =====

export async function createConversation(): Promise<ConversationSession> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await handleResponse(res) as any;

  return {
    sessionId: json.session_id,
    status: json.status,
    firstMessage: json.first_message,
    createdAt: json.created_at,
  };
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/conversation/${conversationId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await handleResponse(res) as any;
  const rawMessages = json.messages ?? [];
  return rawMessages.map((m: unknown) => adaptMessage(m, conversationId));
}

// ===== Speech API =====

export async function requestTts(text: string): Promise<TtsResponse> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/speech/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await handleResponse(res) as any;

  return {
    audioUrl: json.audio_url ?? '',
    text: json.text,
    cached: json.cached,
    durationMs: json.duration_ms,
  };
}

export async function evaluatePronunciation(text: string): Promise<PronunciationResult> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/speech/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await handleResponse(res) as any;

  return {
    overallScore: json.overall_score ?? 0,
    accuracyScore: json.accuracy_score ?? 0,
    fluencyScore: json.fluency_score ?? 0,
    completenessScore: json.completeness_score ?? 0,
    feedback: json.feedback ?? '',
  };
}

export async function completeDiary(id: string): Promise<void> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}/complete`, { method: 'POST' });
  await handleResponse(res);
}
