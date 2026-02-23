import { Diary, PaginatedResponse } from '../types';
import { mockDiaries } from './mockData';

const USE_MOCK = true;
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Simulate network delay
const delay = (ms: number = 500) => new Promise(resolve => setTimeout(resolve, ms));

// ===== Diary API =====

export async function getDiaries(cursor?: string, limit: number = 20): Promise<PaginatedResponse<Diary>> {
  if (USE_MOCK) {
    await delay();
    return { data: mockDiaries, hasMore: false };
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
