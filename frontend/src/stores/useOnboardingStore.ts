import { create } from 'zustand';

interface OnboardingData {
  native_language_id: number | null;
  target_language_id: number | null;
  avatar_id: number | null;
  avatar_name: string;
  voice_id: number | null;
  pronunciation_voice_id: number | null;
  empathy: number;
  intuition: number;
  logic: number;
  app_locale: string;
  cefr_level: string | null;
}

interface OnboardingState extends OnboardingData {
  setLanguages: (nativeId: number, targetId: number) => void;
  setAvatar: (avatarId: number, avatarName?: string) => void;
  setVoice: (voiceId: number) => void;
  setPronunciationVoice: (voiceId: number) => void;
  setPersonality: (empathy: number, intuition: number, logic: number) => void;
  setLocale: (locale: string) => void;
  setCefrLevel: (level: string) => void;
  reset: () => void;
  toApiPayload: () => object;
}

const initialState: OnboardingData = {
  native_language_id: null,
  target_language_id: null,
  avatar_id: null,
  avatar_name: '',
  voice_id: null,
  pronunciation_voice_id: null,
  empathy: 34,
  intuition: 33,
  logic: 33,
  app_locale: 'ko',
  cefr_level: null,
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...initialState,
  setLanguages: (nativeId, targetId) =>
    set({ native_language_id: nativeId, target_language_id: targetId }),
  setAvatar: (avatarId, avatarName) =>
    set({ avatar_id: avatarId, avatar_name: avatarName ?? '' }),
  setVoice: (voiceId) => set({ voice_id: voiceId }),
  setPronunciationVoice: (voiceId) => set({ pronunciation_voice_id: voiceId }),
  setPersonality: (empathy, intuition, logic) => set({ empathy, intuition, logic }),
  setLocale: (locale) => set({ app_locale: locale }),
  setCefrLevel: (level) => set({ cefr_level: level }),
  reset: () => set(initialState),
  toApiPayload: () => {
    const s = get();
    return {
      native_language_id: s.native_language_id,
      target_language_id: s.target_language_id,
      avatar_id: s.avatar_id,
      avatar_name: s.avatar_name || undefined,
      voice_id: s.voice_id,
      pronunciation_voice_id: s.pronunciation_voice_id ?? undefined,
      empathy: s.empathy,
      intuition: s.intuition,
      logic: s.logic,
      app_locale: s.app_locale,
      cefr_level: s.cefr_level || undefined,
    };
  },
}));
