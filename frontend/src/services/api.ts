import { Diary, Message, PaginatedResponse, ConversationSession, TtsResponse, PronunciationResult } from '../types';
import { mockDiaries, mockMessagesByConversation } from './mockData';

const USE_MOCK = true;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Simulate network delay
const delay = (ms: number = 500) => new Promise(resolve => setTimeout(resolve, ms));

// ===== Diary API =====

export async function getDiaries(cursor?: string, limit: number = 20): Promise<PaginatedResponse<Diary>> {
  if (USE_MOCK) {
    await delay();
    // Simulate cursor-based pagination
    let items = [...mockDiaries];
    if (cursor) {
      const idx = items.findIndex(d => d.id === cursor);
      if (idx >= 0) {
        items = items.slice(idx + 1);
      }
    }
    const page = items.slice(0, limit);
    const hasMore = items.length > limit;
    return {
      data: page,
      cursor: hasMore ? page[page.length - 1]?.id : undefined,
      hasMore,
    };
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/diary?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
  return res.json();
}

export async function getDiary(id: string): Promise<Diary> {
  if (USE_MOCK) {
    await delay();
    const diary = mockDiaries.find(d => d.id === id);
    if (!diary) throw new Error('Diary not found');
    return diary;
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/diary/${id}`);
  return res.json();
}

export async function deleteDiary(id: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300);
    return;
  }
  await fetch(`${API_BASE_URL}/api/v1/diary/${id}`, { method: 'DELETE' });
}

export async function updateDiary(id: string, data: Partial<Diary>): Promise<Diary> {
  if (USE_MOCK) {
    await delay();
    const diary = mockDiaries.find(d => d.id === id);
    if (!diary) throw new Error('Diary not found');
    return { ...diary, ...data };
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/diary/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// ===== Conversation API =====

export async function createConversation(): Promise<ConversationSession> {
  if (USE_MOCK) {
    await delay(400);
    return {
      session_id: `conv_${Date.now()}`,
      status: 'active',
      first_message: '안녕! 오늘 하루 어땠어?',
      created_at: new Date().toISOString(),
    };
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/conversation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return res.json();
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  if (USE_MOCK) {
    await delay(300);
    return mockMessagesByConversation[conversationId] ?? [];
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/conversation/${conversationId}`);
  const data = await res.json();
  return data.messages ?? [];
}

// ===== Speech API =====

export async function requestTts(text: string): Promise<TtsResponse> {
  if (USE_MOCK) {
    await delay(800);
    return { audioUrl: `mock://tts/${Date.now()}.mp3` };
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/speech/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function evaluatePronunciation(text: string): Promise<PronunciationResult> {
  if (USE_MOCK) {
    await delay(1500);
    const base = 70 + Math.random() * 25;
    return {
      overallScore: Math.round(base),
      accuracyScore: Math.round(base + (Math.random() - 0.5) * 10),
      fluencyScore: Math.round(base + (Math.random() - 0.5) * 10),
      completenessScore: Math.round(base + (Math.random() - 0.5) * 10),
      feedback: 'Good pronunciation! Pay attention to word stress and intonation.',
    };
  }
  const res = await fetch(`${API_BASE_URL}/api/v1/speech/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function completeDiary(id: string): Promise<void> {
  if (USE_MOCK) {
    await delay(300);
    return;
  }
  await fetch(`${API_BASE_URL}/api/v1/diary/${id}/complete`, { method: 'POST' });
}
