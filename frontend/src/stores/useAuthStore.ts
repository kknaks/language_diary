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

  setLoading: (loading) => set({ isLoading: loading }),

  initializeFromStorage: async () => {
    set({ isLoading: true });
    try {
      const accessToken = await tokenManager.getAccessToken();
      if (!accessToken || tokenManager.isTokenExpired(accessToken)) {
        // 만료됐거나 없으면 — refresh는 api.ts 인터셉터에서 처리
        // 여기서는 그냥 비인증 상태로 둠 (첫 API 호출 시 인터셉터가 처리)
        const refreshToken = await tokenManager.getRefreshToken();
        if (!refreshToken) {
          set({ isAuthenticated: false, isLoading: false });
          return;
        }
        // refresh token이 있으면 인증 상태로 마킹 (api.ts가 실제 갱신)
        set({ isAuthenticated: true, isLoading: false });
        return;
      }
      set({ isAuthenticated: true, isLoading: false });
    } catch {
      set({ isAuthenticated: false, isLoading: false });
    }
  },
}));
