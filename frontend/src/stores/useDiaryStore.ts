import { create } from 'zustand';
import { Diary } from '../types';
import { getDiaries } from '../services/api';

interface DiaryState {
  diaries: Diary[];
  isLoading: boolean;
  error: string | null;
  fetchDiaries: () => Promise<void>;
}

export const useDiaryStore = create<DiaryState>((set) => ({
  diaries: [],
  isLoading: false,
  error: null,
  fetchDiaries: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await getDiaries();
      set({ diaries: res.data, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || '일기를 불러오지 못했습니다', isLoading: false });
    }
  },
}));
