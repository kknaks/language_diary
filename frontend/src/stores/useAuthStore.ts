import { create } from 'zustand';
import { AuthUser, AuthTokens } from '../types/auth';
import { tokenManager } from '../utils/tokenManager';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  isLoading: boolean;

  setAuth: (user: AuthUser, tokens: AuthTokens) => Promise<void>;
  clearAuth: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  setOnboarded: (newAccessToken: string) => Promise<void>;
  setLoading: (loading: boolean) => void;
  initializeFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isOnboarded: false,
  isLoading: true,

  setAuth: async (user, tokens) => {
    await tokenManager.saveTokens(tokens.access_token, tokens.refresh_token);
    set({
      user,
      isAuthenticated: true,
      isOnboarded: user.onboarding_completed,
    });
  },

  clearAuth: async () => {
    await tokenManager.clearTokens();
    set({
      user: null,
      isAuthenticated: false,
      isOnboarded: false,
    });
  },

  setUser: (user) => set({ user, isOnboarded: user.onboarding_completed }),

  setOnboarded: async (newAccessToken) => {
    const refreshToken = await tokenManager.getRefreshToken();
    if (refreshToken) {
      await tokenManager.saveTokens(newAccessToken, refreshToken);
    }
    set((state) => ({
      isOnboarded: true,
      user: state.user ? { ...state.user, onboarding_completed: true } : state.user,
    }));
  },

  setLoading: (loading) => set({ isLoading: loading }),

  initializeFromStorage: async () => {
    set({ isLoading: true });
    try {
      const accessToken = await tokenManager.getAccessToken();
      if (!accessToken || tokenManager.isTokenExpired(accessToken)) {
        const refreshToken = await tokenManager.getRefreshToken();
        if (!refreshToken) {
          set({ isAuthenticated: false, isOnboarded: false, isLoading: false });
          return;
        }
        // refresh token이 있으면 인증 상태로 마킹 (api.ts가 실제 갱신)
        // onboarded는 갱신 후 새 토큰에서 읽힘 — 일단 true로 두고 홈 진입 허용
        set({ isAuthenticated: true, isOnboarded: true, isLoading: false });
        return;
      }
      const isOnboarded = tokenManager.getOnboardingCompleted(accessToken);
      set({ isAuthenticated: true, isOnboarded, isLoading: false });
    } catch {
      set({ isAuthenticated: false, isOnboarded: false, isLoading: false });
    }
  },
}));
