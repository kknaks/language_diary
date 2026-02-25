import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useProfileStore } from '../../src/stores/useProfileStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { authApi } from '../../src/services/api';
import { tokenManager } from '../../src/utils/tokenManager';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../src/constants/theme';
import { ScreenHeader } from '../../src/components/common';

export default function MyPageScreen() {
  const router = useRouter();
  const { profile, isLoading, fetchProfile, updateProfile, clearProfile } = useProfileStore();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  const handleLogout = useCallback(async () => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            const refreshToken = await tokenManager.getRefreshToken();
            if (refreshToken) {
              await authApi.logout(refreshToken);
            }
          } catch {
            // Ignore logout API error
          }
          clearProfile();
          await clearAuth();
          router.replace('/login' as never);
        },
      },
    ]);
  }, [clearAuth, clearProfile, router]);

  const handleDeleteAccount = useCallback(async () => {
    Alert.alert(
      '회원 탈퇴',
      '정말 탈퇴하시겠습니까? 모든 데이터가 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              await authApi.deleteAccount();
            } catch {
              // Ignore — best-effort
            }
            clearProfile();
            await clearAuth();
            router.replace('/login' as never);
          },
        },
      ],
    );
  }, [clearAuth, clearProfile, router]);

  const handleNicknameSave = useCallback(async () => {
    if (!nicknameInput.trim()) return;
    await updateProfile({ nickname: nicknameInput.trim() });
    setIsEditingNickname(false);
  }, [nicknameInput, updateProfile]);

  const handleStartEditNickname = useCallback(() => {
    setNicknameInput(profile?.nickname ?? '');
    setIsEditingNickname(true);
  }, [profile]);

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="마이페이지" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const avatarData = profile?.profile?.avatar;
  const voiceData = profile?.profile?.voice;
  const targetLang = profile?.profile?.target_language;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="마이페이지" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={[styles.avatarCircle, { backgroundColor: avatarData?.primary_color ?? colors.primaryLight }]}>
            {avatarData?.thumbnail_url ? (
              <Image source={{ uri: avatarData.thumbnail_url }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={40} color="#fff" />
            )}
          </View>
          <Text style={styles.nickname}>{profile?.nickname ?? '사용자'}</Text>
          <Text style={styles.email}>{profile?.email ?? ''}</Text>
        </View>

        {/* Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>설정</Text>

          {/* Nickname */}
          <TouchableOpacity style={styles.row} onPress={handleStartEditNickname}>
            <View style={styles.rowLeft}>
              <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>닉네임</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{profile?.nickname ?? '-'}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </View>
          </TouchableOpacity>

          {/* Nickname edit inline */}
          {isEditingNickname && (
            <View style={styles.editRow}>
              <TextInput
                style={styles.textInput}
                value={nicknameInput}
                onChangeText={setNicknameInput}
                placeholder="새 닉네임"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleNicknameSave}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={handleNicknameSave}>
                <Text style={styles.saveBtnText}>저장</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsEditingNickname(false)}>
                <Text style={styles.cancelBtnText}>취소</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Avatar */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="happy-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>아바타</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {profile?.profile?.avatar_name ?? avatarData?.name ?? '-'}
              </Text>
            </View>
          </View>

          {/* Voice */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="mic-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>목소리</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{voiceData?.name ?? '-'}</Text>
            </View>
          </View>

          {/* Personality */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="sparkles-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>성격</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                공감 {profile?.profile?.empathy ?? 0} · 직관 {profile?.profile?.intuition ?? 0} · 논리 {profile?.profile?.logic ?? 0}
              </Text>
            </View>
          </View>

          {/* Target Language */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="language-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>학습 언어</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{targetLang?.name_native ?? '-'}</Text>
            </View>
          </View>

          {/* CEFR Level */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="school-outline" size={20} color={colors.textSecondary} />
              <Text style={styles.rowLabel}>레벨</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{profile?.language_level?.cefr_level ?? '-'}</Text>
            </View>
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계정</Text>

          <TouchableOpacity style={styles.row} onPress={handleLogout}>
            <View style={styles.rowLeft}>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={[styles.rowLabel, { color: colors.error }]}>로그아웃</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={handleDeleteAccount}>
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={20} color={colors.error} />
              <Text style={[styles.rowLabel, { color: colors.error }]}>회원 탈퇴</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  // Profile Header
  profileHeader: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  nickname: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  // Sections
  section: {
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowLabel: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  rowValue: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  // Nickname edit
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.sm,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
});
