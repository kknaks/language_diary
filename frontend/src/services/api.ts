import { Diary, LearningCard, Message, PaginatedResponse, ConversationSession, TtsResponse, PronunciationResult } from '../types';
import { AuthTokens } from '../types/auth';
import { LanguageListResponse, AvatarListResponse, VoiceListResponse } from '../types/seed';
import { env } from '../config/env';
import { debugFetch } from '../components/common/DebugBanner';
import { tokenManager } from '../utils/tokenManager';

const API_BASE_URL = env.API_BASE_URL;

// ===== Token refresh queue =====

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

function processRefreshQueue(error: Error | null, token: string | null) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  refreshQueue = [];
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await tokenManager.getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    throw new Error(`Refresh failed: ${res.status}`);
  }

  const tokens: AuthTokens = await res.json();
  await tokenManager.saveTokens(tokens.access_token, tokens.refresh_token);
  return tokens.access_token;
}

async function handleTokenRefresh(): Promise<string> {
  if (isRefreshing) {
    // Already refreshing — queue this request
    return new Promise<string>((resolve, reject) => {
      refreshQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  try {
    const newToken = await refreshAccessToken();
    processRefreshQueue(null, newToken);
    return newToken;
  } catch (error) {
    processRefreshQueue(error as Error, null);
    // Clear auth state — lazy import to avoid circular dependency
    const { useAuthStore } = await import('../stores/useAuthStore');
    await useAuthStore.getState().clearAuth();
    throw error;
  } finally {
    isRefreshing = false;
  }
}

// ===== Authenticated fetch wrapper =====

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await tokenManager.getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  let response = await debugFetch(url, { ...options, headers });

  if (response.status === 401) {
    try {
      const newToken = await handleTokenRefresh();
      // Retry original request with new token
      headers.Authorization = `Bearer ${newToken}`;
      response = await debugFetch(url, { ...options, headers });
    } catch {
      // Refresh failed — return original 401 response
      return response;
    }
  }

  return response;
}

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

// ===== Adapters: backend → frontend =====

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDiary(raw: any): Diary {
  return {
    id: raw.id,
    user_id: raw.user_id,
    original_text: raw.original_text ?? '',
    translated_text: raw.translated_text ?? null,
    status: raw.status ?? 'draft',
    created_at: raw.created_at ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? new Date().toISOString(),
    completed_at: raw.completed_at ?? null,
    learning_cards: Array.isArray(raw.learning_cards)
      ? raw.learning_cards.map(normalizeLearningCard)
      : [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLearningCard(raw: any): LearningCard {
  return {
    id: raw.id,
    card_type: raw.card_type ?? 'word',
    content_en: raw.content_en ?? '',
    content_ko: raw.content_ko ?? '',
    part_of_speech: raw.part_of_speech ?? null,
    cefr_level: raw.cefr_level ?? null,
    example_en: raw.example_en ?? null,
    example_ko: raw.example_ko ?? null,
    card_order: raw.card_order ?? 0,
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

// Exported for WebSocket diary_created handling
export { normalizeDiary };

// ===== Diary API =====

export async function getDiaries(cursor?: number | null, limit: number = 20): Promise<PaginatedResponse<Diary>> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor != null) params.set('cursor', String(cursor));

  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary?${params}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await handleResponse(res) as any;

  return {
    items: Array.isArray(json.items) ? json.items.map(normalizeDiary) : [],
    next_cursor: json.next_cursor ?? null,
    has_next: json.has_next ?? false,
  };
}

export async function getDiary(id: string | number): Promise<Diary> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}`);
  const json = await handleResponse(res);
  return normalizeDiary(json);
}

export async function deleteDiary(id: string | number): Promise<void> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}`, { method: 'DELETE' });
  await handleResponse(res);
}

export async function updateDiary(id: string | number, data: { original_text?: string; translated_text?: string }): Promise<Diary> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await handleResponse(res);
  return normalizeDiary(json);
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

// ===== ConvAI API (deprecated — kept for rollback) =====

export async function createConvAISession(): Promise<{ session_id: string; signed_url: string }> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/convai/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return await handleResponse(res) as { session_id: string; signed_url: string };
}

export async function finishConvAISession(
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
): Promise<Diary> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/convai/session/${sessionId}/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  const json = await handleResponse(res);
  return normalizeDiary(json);
}

// ===== Custom Pipeline Conversation API =====

export async function createConversationSession(): Promise<{ session_id: string }> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return await handleResponse(res) as { session_id: string };
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

export async function completeDiary(id: string | number): Promise<void> {
  const res = await debugFetch(`${API_BASE_URL}/api/v1/diary/${id}/complete`, { method: 'POST' });
  await handleResponse(res);
}

// ===== Auth API =====

export const authApi = {
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return (await handleResponse(res)) as AuthTokens;
  },
  // socialLogin은 S2에서 추가
};

// ===== Seed Data API =====

export const seedApi = {
  async getLanguages(): Promise<LanguageListResponse> {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/seed/languages`);
    return (await handleResponse(res)) as LanguageListResponse;
  },

  async getAvatars(): Promise<AvatarListResponse> {
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/seed/avatars`);
    return (await handleResponse(res)) as AvatarListResponse;
  },

  async getVoices(languageId?: number): Promise<VoiceListResponse> {
    const params = languageId ? `?language_id=${languageId}` : '';
    const res = await fetchWithAuth(`${API_BASE_URL}/api/v1/seed/voices${params}`);
    return (await handleResponse(res)) as VoiceListResponse;
  },
};
