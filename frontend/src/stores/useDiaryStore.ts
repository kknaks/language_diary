import { create } from 'zustand';
import { Diary } from '../types';
import { getDiaries, deleteDiary as deleteDiaryApi } from '../services/api';

interface DiaryState {
  diaries: Diary[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  cursor: number | null;
  hasMore: boolean;

  fetchDiaries: () => Promise<void>;
  fetchMore: () => Promise<void>;
  removeDiary: (id: number) => Promise<void>;
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  diaries: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,
  cursor: null,
  hasMore: true,

  fetchDiaries: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await getDiaries(undefined, 20);
      set({
        diaries: res.items,
        cursor: res.next_cursor,
        hasMore: res.has_next,
        isLoading: false,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '일기를 불러오지 못했습니다';
      set({ error: msg, isLoading: false });
    }
  },

  fetchMore: async () => {
    const { isLoadingMore, hasMore, cursor } = get();
    if (isLoadingMore || !hasMore) return;

    set({ isLoadingMore: true });
    try {
      const res = await getDiaries(cursor, 20);
      set((state) => ({
        diaries: [...state.diaries, ...res.items],
        cursor: res.next_cursor,
        hasMore: res.has_next,
        isLoadingMore: false,
      }));
    } catch {
      set({ isLoadingMore: false });
    }
  },

  removeDiary: async (id: number) => {
    // Optimistic removal
    const prevDiaries = get().diaries;
    set((state) => ({
      diaries: state.diaries.filter((d) => d.id !== id),
    }));

    try {
      await deleteDiaryApi(id);
    } catch {
      // Rollback on failure
      set({ diaries: prevDiaries, error: '삭제에 실패했습니다' });
    }
  },
}));
