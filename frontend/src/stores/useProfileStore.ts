import { create } from 'zustand';
import { UserProfileResponse, ProfileUpdateRequest } from '../types/profile';
import { profileApi } from '../services/api';

interface ProfileState {
  profile: UserProfileResponse | null;
  isLoading: boolean;
  error: string | null;

  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<ProfileUpdateRequest>) => Promise<void>;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  isLoading: false,
  error: null,

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const profile = await profileApi.getProfile();
      set({ profile, isLoading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '프로필을 불러오지 못했습니다';
      set({ error: msg, isLoading: false });
    }
  },

  updateProfile: async (data: Partial<ProfileUpdateRequest>) => {
    set({ isLoading: true, error: null });
    try {
      await profileApi.updateProfile(data as ProfileUpdateRequest);
      const profile = await profileApi.getProfile();
      set({ profile, isLoading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '프로필 수정에 실패했습니다';
      set({ error: msg, isLoading: false });
    }
  },

  clearProfile: () => {
    set({ profile: null, isLoading: false, error: null });
  },
}));
