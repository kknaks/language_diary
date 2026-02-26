import { create } from 'zustand';
import { seedApi } from '../services/api';
import { Avatar, Voice } from '../types/seed';

interface OnboardingPrefetchState {
  avatars: Avatar[] | null;
  voices: Voice[] | null;
  prefetchAvatars: () => Promise<void>;
  prefetchVoices: (nativeLanguageId?: number) => Promise<void>;
}

export const useOnboardingPrefetch = create<OnboardingPrefetchState>((set, get) => ({
  avatars: null,
  voices: null,

  prefetchAvatars: async () => {
    if (get().avatars) return;
    try {
      const res = await seedApi.getAvatars();
      set({ avatars: res.items.filter((a) => a.is_active) });
    } catch {
      // 실패해도 step2에서 다시 로드
    }
  },

  prefetchVoices: async (nativeLanguageId?: number) => {
    if (get().voices) return;
    try {
      const res = await seedApi.getVoices(nativeLanguageId);
      set({ voices: res.items.filter((v) => v.is_active) });
    } catch {
      // 실패해도 step3에서 다시 로드
    }
  },
}));
