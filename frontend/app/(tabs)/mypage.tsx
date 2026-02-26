import React, { useEffect, useCallback, useState, useRef } from 'react';
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
  FlatList,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useProfileStore } from '../../src/stores/useProfileStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { authApi, seedApi, profileApi } from '../../src/services/api';
import { tokenManager } from '../../src/utils/tokenManager';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../src/constants/theme';
import { ScreenHeader } from '../../src/components/common';
import { Language, Avatar, Voice } from '../../src/types/seed';

// ─── Custom slider ────────────────────────────────────────────────────────────

function SimpleSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const trackWidth = useRef(0);
  const [thumbLeft, setThumbLeft] = useState(0);

  const updateFromX = useCallback(
    (x: number) => {
      if (trackWidth.current === 0) return;
      const pct = Math.max(0, Math.min(1, x / trackWidth.current));
      const newVal = Math.round(pct * 100);
      onChange(newVal);
      setThumbLeft(pct * trackWidth.current);
    },
    [onChange],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => updateFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => updateFromX(evt.nativeEvent.locationX),
    }),
  ).current;

  const fillWidth = trackWidth.current > 0 ? (value / 100) * trackWidth.current : 0;
  const effectiveThumbLeft = trackWidth.current > 0 ? thumbLeft : 0;

  return (
    <View
      style={sliderStyles.track}
      onLayout={(e: LayoutChangeEvent) => {
        trackWidth.current = e.nativeEvent.layout.width;
        setThumbLeft((value / 100) * e.nativeEvent.layout.width);
      }}
      {...panResponder.panHandlers}
    >
      <View style={[sliderStyles.fill, { width: fillWidth }]} />
      <View style={[sliderStyles.thumb, { left: effectiveThumbLeft - 10 }]} />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginVertical: spacing.md,
    position: 'relative',
    justifyContent: 'center',
  },
  fill: {
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    position: 'absolute',
    top: -8,
    marginLeft: -10,
  },
});

// ─── Depth types ─────────────────────────────────────────────────────────────

type Screen =
  | 'main'
  | 'account'
  | 'avatar'
  | 'learning'
  | 'terms'
  | 'nickname'
  | 'appLocale'
  | 'nativeLanguage'
  | 'avatarCharacter'
  | 'avatarVoice'
  | 'avatarPersonality'
  | 'learningLanguage'
  | 'learningLevel'
  | 'learningPronunciation'
  | 'termsPrivacy'
  | 'termsService';

const APP_LOCALES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
];

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// ─── Helper: row item ─────────────────────────────────────────────────────────

function RowItem({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.6 : 1}
      disabled={!onPress}
    >
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={danger ? colors.error : colors.textSecondary} />
        <Text style={[styles.rowLabel, danger && { color: colors.error }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MyPageScreen() {
  const router = useRouter();
  const { profile, isLoading, fetchProfile, updateProfile, clearProfile } = useProfileStore();
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [screen, setScreen] = useState<Screen>('main');
  const [refreshing, setRefreshing] = useState(false);

  // Account settings state
  const [nicknameInput, setNicknameInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed data
  const [languages, setLanguages] = useState<Language[]>([]);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [seedLoading, setSeedLoading] = useState(false);

  // Personality sliders
  const [empathy, setEmpathy] = useState(50);
  const [intuition, setIntuition] = useState(50);
  const [logic, setLogic] = useState(50);
  const personalityLoaded = useRef(false);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Sync personality sliders when profile loads
  useEffect(() => {
    if (profile?.profile && !personalityLoaded.current) {
      setEmpathy(profile.profile.empathy ?? 50);
      setIntuition(profile.profile.intuition ?? 50);
      setLogic(profile.profile.logic ?? 50);
      personalityLoaded.current = true;
    }
  }, [profile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    personalityLoaded.current = false;
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  const loadSeedData = useCallback(async (type: 'languages' | 'avatars' | 'voices') => {
    setSeedLoading(true);
    try {
      if (type === 'languages') {
        const res = await seedApi.getLanguages();
        setLanguages(res.items);
      } else if (type === 'avatars') {
        const res = await seedApi.getAvatars();
        setAvatars(res.items);
      } else if (type === 'voices') {
        const langId = profile?.profile?.target_language?.id;
        const res = await seedApi.getVoices(langId);
        setVoices(res.items);
      }
    } catch {
      // ignore
    } finally {
      setSeedLoading(false);
    }
  }, [profile]);

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const goTo = useCallback((s: Screen, preload?: 'languages' | 'avatars' | 'voices') => {
    if (preload) loadSeedData(preload);
    setScreen(s);
  }, [loadSeedData]);

  const goBack = useCallback((parent: Screen) => {
    setScreen(parent);
  }, []);

  // ── Account actions ────────────────────────────────────────────────────────

  const handleLogout = useCallback(() => {
    Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            const rt = await tokenManager.getRefreshToken();
            if (rt) await authApi.logout(rt);
          } catch {
            // ignore
          }
          clearProfile();
          await clearAuth();
          router.replace('/login' as never);
        },
      },
    ]);
  }, [clearAuth, clearProfile, router]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      '회원 탈퇴',
      '정말 탈퇴하시겠습니까?\n모든 데이터가 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: async () => {
            try {
              await authApi.deleteAccount();
            } catch {
              // best-effort
            }
            clearProfile();
            await clearAuth();
            router.replace('/login' as never);
          },
        },
      ],
    );
  }, [clearAuth, clearProfile, router]);

  // ── Profile update helpers ─────────────────────────────────────────────────

  const saveProfile = useCallback(
    async (data: Parameters<typeof updateProfile>[0]) => {
      setSaving(true);
      try {
        await updateProfile(data);
      } finally {
        setSaving(false);
      }
    },
    [updateProfile],
  );

  // ─── Screen: Loading ──────────────────────────────────────────────────────

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
  const nativeLang = profile?.profile?.native_language;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER SCREENS
  // ─────────────────────────────────────────────────────────────────────────

  // ── 3depth: Nickname edit ─────────────────────────────────────────────────
  if (screen === 'nickname') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="닉네임 수정"
          left={<TouchableOpacity onPress={() => goBack('account')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <View style={styles.formContainer}>
          <Text style={styles.fieldLabel}>새 닉네임</Text>
          <TextInput
            style={styles.textInput}
            value={nicknameInput}
            onChangeText={setNicknameInput}
            placeholder="닉네임을 입력하세요"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.disabledBtn]}
            onPress={async () => {
              if (!nicknameInput.trim()) return;
              await saveProfile({ nickname: nicknameInput.trim() });
              goBack('account');
            }}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>저장</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── 3depth: App locale ────────────────────────────────────────────────────
  if (screen === 'appLocale') {
    const currentLocale = profile?.profile?.app_locale ?? 'ko';
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="화면 출력 언어"
          left={<TouchableOpacity onPress={() => goBack('account')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView>
          {APP_LOCALES.map((loc) => (
            <TouchableOpacity
              key={loc.code}
              style={styles.row}
              onPress={async () => {
                await saveProfile({ app_locale: loc.code });
                goBack('account');
              }}
            >
              <Text style={styles.rowLabel}>{loc.label}</Text>
              {currentLocale === loc.code && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 3depth: Native language ───────────────────────────────────────────────
  if (screen === 'nativeLanguage') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="모국어 변경"
          left={<TouchableOpacity onPress={() => goBack('account')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        {seedLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={languages}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={async () => {
                  await saveProfile({ native_language_id: item.id });
                  goBack('account');
                }}
              >
                <Text style={styles.rowLabel}>{item.name_native}</Text>
                {nativeLang?.id === item.id && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── 3depth: Avatar character ──────────────────────────────────────────────
  if (screen === 'avatarCharacter') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="캐릭터 변경"
          left={<TouchableOpacity onPress={() => goBack('avatar')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        {seedLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={avatars}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            contentContainerStyle={styles.gridContainer}
            renderItem={({ item }) => {
              const selected = avatarData?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.avatarGridItem, selected && styles.avatarGridSelected]}
                  onPress={async () => {
                    await saveProfile({ avatar_id: item.id });
                    goBack('avatar');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatarThumb, { backgroundColor: item.primary_color }]}>
                    {item.thumbnail_url ? (
                      <Image source={{ uri: item.thumbnail_url }} style={styles.avatarThumbImg} />
                    ) : (
                      <Ionicons name="person" size={32} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.avatarGridName}>{item.name}</Text>
                  {selected && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.avatarCheck} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── 3depth: Avatar voice ──────────────────────────────────────────────────
  if (screen === 'avatarVoice') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="목소리 설정"
          left={<TouchableOpacity onPress={() => goBack('avatar')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        {seedLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={voices}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              const selected = voiceData?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.row, selected && styles.selectedRow]}
                  onPress={async () => {
                    await saveProfile({ voice_id: item.id });
                    goBack('avatar');
                  }}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons name="musical-note-outline" size={20} color={colors.textSecondary} />
                    <View>
                      <Text style={styles.rowLabel}>{item.name}</Text>
                      <Text style={styles.rowSubtext}>
                        {item.gender === 'male' ? '남성' : '여성'}
                        {item.tone ? ` · ${item.tone}` : ''}
                      </Text>
                    </View>
                  </View>
                  {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── 3depth: Personality sliders ───────────────────────────────────────────
  if (screen === 'avatarPersonality') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="성격 설정"
          left={<TouchableOpacity onPress={() => goBack('avatar')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView contentContainerStyle={styles.formContainer}>
          {[
            { label: '공감', value: empathy, set: setEmpathy },
            { label: '직관', value: intuition, set: setIntuition },
            { label: '논리', value: logic, set: setLogic },
          ].map(({ label, value, set }) => (
            <View key={label} style={styles.sliderBlock}>
              <View style={styles.sliderHeader}>
                <Text style={styles.fieldLabel}>{label}</Text>
                <Text style={styles.sliderValue}>{value}</Text>
              </View>
              <SimpleSlider value={value} onChange={set} />
            </View>
          ))}
          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.disabledBtn]}
            onPress={async () => {
              await saveProfile({ empathy, intuition, logic });
              goBack('avatar');
            }}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>저장</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 3depth: Learning language ─────────────────────────────────────────────
  if (screen === 'learningLanguage') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="학습 언어"
          left={<TouchableOpacity onPress={() => goBack('learning')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        {seedLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={languages}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={async () => {
                  await saveProfile({ target_language_id: item.id });
                  goBack('learning');
                }}
              >
                <Text style={styles.rowLabel}>{item.name_native}</Text>
                {targetLang?.id === item.id && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── 3depth: Learning level ────────────────────────────────────────────────
  if (screen === 'learningLevel') {
    const currentLevel = profile?.language_level?.cefr_level;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="레벨 선택"
          left={<TouchableOpacity onPress={() => goBack('learning')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView>
          {CEFR_LEVELS.map((lvl) => (
            <TouchableOpacity
              key={lvl}
              style={styles.row}
              onPress={async () => {
                if (profile?.profile?.target_language?.id) {
                  setSaving(true);
                  try {
                    await profileApi.updateLanguageLevel({
                      language_id: profile.profile.target_language.id,
                      cefr_level: lvl,
                    });
                    await fetchProfile();
                  } finally {
                    setSaving(false);
                  }
                }
                goBack('learning');
              }}
            >
              <Text style={styles.rowLabel}>{lvl}</Text>
              {currentLevel === lvl && (
                <Ionicons name="checkmark" size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 3depth: Pronunciation voice ───────────────────────────────────────────
  if (screen === 'learningPronunciation') {
    const currentPronVoiceId = profile?.profile?.pronunciation_voice_id;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="발음 목소리"
          left={<TouchableOpacity onPress={() => goBack('learning')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        {seedLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            data={voices}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => {
              const selected = currentPronVoiceId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.row, selected && styles.selectedRow]}
                  onPress={async () => {
                    await saveProfile({ pronunciation_voice_id: item.id });
                    goBack('learning');
                  }}
                >
                  <View style={styles.rowLeft}>
                    <Ionicons name="mic-outline" size={20} color={colors.textSecondary} />
                    <View>
                      <Text style={styles.rowLabel}>{item.name}</Text>
                      <Text style={styles.rowSubtext}>
                        {item.gender === 'male' ? '남성' : '여성'}
                        {item.tone ? ` · ${item.tone}` : ''}
                      </Text>
                    </View>
                  </View>
                  {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── 3depth: Terms ─────────────────────────────────────────────────────────
  if (screen === 'termsPrivacy' || screen === 'termsService') {
    const isPrivacy = screen === 'termsPrivacy';
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title={isPrivacy ? '개인정보처리방침' : '서비스 이용약관'}
          left={<TouchableOpacity onPress={() => goBack('terms')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView contentContainerStyle={styles.termsContainer}>
          <Text style={styles.termsTitle}>
            {isPrivacy ? '개인정보처리방침' : '서비스 이용약관'}
          </Text>
          <Text style={styles.termsBody}>
            {isPrivacy
              ? `본 개인정보처리방침은 Language Diary 앱 서비스에서 수집하는 개인정보의 항목, 수집 및 이용목적, 보유 및 이용기간 등을 안내합니다.\n\n1. 수집하는 개인정보\n이메일, 닉네임, 학습 데이터 등 서비스 이용에 필요한 최소한의 정보를 수집합니다.\n\n2. 개인정보 이용목적\n서비스 제공, 학습 분석, 맞춤형 콘텐츠 제공 등에 활용됩니다.\n\n3. 보유 및 이용기간\n회원 탈퇴 시까지 보유하며, 탈퇴 후 즉시 삭제됩니다.\n\n4. 문의\ncontact@languagediary.app`
              : `본 이용약관은 Language Diary 서비스 이용에 관한 조건 및 절차 등을 규정합니다.\n\n제1조(목적)\n본 약관은 Language Diary가 제공하는 언어 학습 일기 서비스의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.\n\n제2조(서비스 이용)\n사용자는 본 서비스를 개인적, 비영리적 목적으로만 사용할 수 있습니다.\n\n제3조(금지행위)\n불법 행위, 서비스 방해, 타인 정보 침해 등의 행위는 금지됩니다.\n\n제4조(면책조항)\n회사는 천재지변 등 불가항력적 사유로 인한 서비스 중단에 대해 책임지지 않습니다.\n\n문의: contact@languagediary.app`}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 2depth: Account settings ──────────────────────────────────────────────
  if (screen === 'account') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="계정 설정"
          left={<TouchableOpacity onPress={() => goBack('main')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>계정 정보</Text>
            <RowItem
              icon="pencil-outline"
              label="닉네임"
              value={profile?.nickname ?? '-'}
              onPress={() => {
                setNicknameInput(profile?.nickname ?? '');
                goTo('nickname');
              }}
            />
            <RowItem
              icon="mail-outline"
              label="이메일"
              value={profile?.email ?? '-'}
            />
            <RowItem
              icon="logo-google"
              label="로그인 방식"
              value={profile?.social_provider ?? '-'}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>앱 설정</Text>
            <RowItem
              icon="globe-outline"
              label="화면 출력 언어"
              value={
                APP_LOCALES.find((l) => l.code === profile?.profile?.app_locale)?.label ??
                profile?.profile?.app_locale ??
                '-'
              }
              onPress={() => goTo('appLocale')}
            />
            <RowItem
              icon="language-outline"
              label="모국어"
              value={nativeLang?.name_native ?? '-'}
              onPress={() => goTo('nativeLanguage', 'languages')}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>계정 관리</Text>
            <RowItem
              icon="log-out-outline"
              label="로그아웃"
              onPress={handleLogout}
              danger
            />
            <RowItem
              icon="trash-outline"
              label="회원 탈퇴"
              onPress={handleDeleteAccount}
              danger
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 2depth: Avatar settings ───────────────────────────────────────────────
  if (screen === 'avatar') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="아바타 설정"
          left={<TouchableOpacity onPress={() => goBack('main')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView>
          <View style={styles.section}>
            <RowItem
              icon="happy-outline"
              label="캐릭터 변경"
              value={avatarData?.name ?? profile?.profile?.avatar_name ?? '-'}
              onPress={() => goTo('avatarCharacter', 'avatars')}
            />
            <RowItem
              icon="mic-outline"
              label="목소리 설정"
              value={voiceData?.name ?? '-'}
              onPress={() => goTo('avatarVoice', 'voices')}
            />
            <RowItem
              icon="sparkles-outline"
              label="성격 설정"
              value={`공감${empathy} 직관${intuition} 논리${logic}`}
              onPress={() => goTo('avatarPersonality')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 2depth: Learning settings ─────────────────────────────────────────────
  if (screen === 'learning') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="학습 설정"
          left={<TouchableOpacity onPress={() => goBack('main')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView>
          <View style={styles.section}>
            <RowItem
              icon="language-outline"
              label="학습 언어"
              value={targetLang?.name_native ?? '-'}
              onPress={() => goTo('learningLanguage', 'languages')}
            />
            <RowItem
              icon="school-outline"
              label="레벨 (CEFR)"
              value={profile?.language_level?.cefr_level ?? '-'}
              onPress={() => goTo('learningLevel')}
            />
            <RowItem
              icon="mic-circle-outline"
              label="발음 목소리"
              value={
                voices.find((v) => v.id === profile?.profile?.pronunciation_voice_id)?.name ?? '-'
              }
              onPress={() => goTo('learningPronunciation', 'voices')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 2depth: Terms ─────────────────────────────────────────────────────────
  if (screen === 'terms') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="약관"
          left={<TouchableOpacity onPress={() => goBack('main')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <ScrollView>
          <View style={styles.section}>
            <RowItem
              icon="shield-checkmark-outline"
              label="개인정보처리방침"
              onPress={() => goTo('termsPrivacy')}
            />
            <RowItem
              icon="document-text-outline"
              label="서비스 이용약관"
              onPress={() => goTo('termsService')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── 1depth: Main ──────────────────────────────────────────────────────────
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
          <Text style={styles.avatarName}>{profile?.profile?.avatar_name ?? avatarData?.name ?? '아바타'}</Text>
          <Text style={styles.nickname}>{profile?.nickname ?? '사용자'}</Text>
          {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
        </View>

        {/* Menu */}
        <View style={styles.section}>
          <RowItem
            icon="person-circle-outline"
            label="계정 설정"
            onPress={() => goTo('account')}
          />
          <RowItem
            icon="happy-outline"
            label="아바타 설정"
            onPress={() => goTo('avatar')}
          />
          <RowItem
            icon="school-outline"
            label="학습 설정"
            onPress={() => goTo('learning')}
          />
          <RowItem
            icon="document-text-outline"
            label="약관"
            onPress={() => goTo('terms')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

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
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
  },
  avatarName: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
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
  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  selectedRow: {
    backgroundColor: colors.primaryLight + '15',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
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
  rowSubtext: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  // Form
  formContainer: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  // Avatar grid
  gridContainer: {
    padding: spacing.md,
    gap: spacing.md,
  },
  avatarGridItem: {
    flex: 1,
    margin: spacing.xs,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.sm,
    position: 'relative',
  },
  avatarGridSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarThumb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  avatarThumbImg: {
    width: 72,
    height: 72,
  },
  avatarGridName: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  avatarCheck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  // Sliders
  sliderBlock: {
    marginBottom: spacing.md,
  },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sliderValue: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  // Terms
  termsContainer: {
    padding: spacing.lg,
  },
  termsTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  termsBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.8,
  },
});
