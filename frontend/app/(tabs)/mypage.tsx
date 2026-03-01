import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useProfileStore } from '../../src/stores/useProfileStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { authApi, seedApi, profileApi, API_BASE_URL } from '../../src/services/api';
import { tokenManager } from '../../src/utils/tokenManager';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../src/constants/theme';
import { ScreenHeader } from '../../src/components/common';
import { Language, Avatar, Voice } from '../../src/types/seed';
import Live2DAvatar from '../../src/components/conversation/Live2DAvatar';
import { useAudioPlayer, useAudioPlayerStatus, useAudioSampleListener } from 'expo-audio';

// ─── RMS volume helper ────────────────────────────────────────────────────────
function calcRMS(frames: number[]): number {
  if (!frames || frames.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frames.length; i++) {
    sum += frames[i] * frames[i];
  }
  return Math.min(1, Math.sqrt(sum / frames.length) * 3);
}

// ─── Personality Row (same as onboarding step4) ──────────────────────────────

function PersonalityRow({
  label,
  emoji,
  value,
  color,
  onIncrement,
  onDecrement,
  onValueChange,
}: {
  label: string;
  emoji: string;
  value: number;
  color: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onValueChange: (v: number) => void;
}) {
  const trackWidth = useRef(0);
  const fillWidth = `${value}%` as const;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const calcValue = (pageX: number, trackPageX: number) => {
    const x = pageX - trackPageX;
    const ratio = x / trackWidth.current;
    return clamp(Math.round(ratio * 100 / 5) * 5);
  };

  const trackRef = useRef<View>(null);
  const trackPageX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        trackRef.current?.measure((_x, _y, _w, _h, pageX) => {
          trackPageX.current = pageX;
          onValueChange(calcValue(evt.nativeEvent.pageX, pageX));
        });
      },
      onPanResponderMove: (evt) => {
        onValueChange(calcValue(evt.nativeEvent.pageX, trackPageX.current));
      },
    }),
  ).current;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  return (
    <View style={personalityRowStyles.container}>
      <View style={personalityRowStyles.header}>
        <Text style={personalityRowStyles.label}>
          {emoji} {label}
        </Text>
        <Text style={[personalityRowStyles.value, { color }]}>{value}</Text>
      </View>
      <View style={personalityRowStyles.barRow}>
        <TouchableOpacity
          style={personalityRowStyles.adjustButton}
          onPress={onDecrement}
          activeOpacity={0.6}
        >
          <Text style={personalityRowStyles.adjustText}>−</Text>
        </TouchableOpacity>
        <View
          ref={trackRef}
          style={personalityRowStyles.barTrack}
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
        >
          <View
            style={[
              personalityRowStyles.barFill,
              { width: fillWidth, backgroundColor: color },
            ]}
          />
          <View
            style={[
              personalityRowStyles.thumb,
              { left: fillWidth, borderColor: color },
            ]}
          />
        </View>
        <TouchableOpacity
          style={personalityRowStyles.adjustButton}
          onPress={onIncrement}
          activeOpacity={0.6}
        >
          <Text style={personalityRowStyles.adjustText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const personalityRowStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  adjustButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjustText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: colors.border,
    borderRadius: 6,
    overflow: 'visible',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  thumb: {
    position: 'absolute',
    top: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    marginLeft: -12,
    ...shadows.sm,
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


const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AVATAR_GAP = 8;
const AVATAR_HORIZONTAL_PADDING = 8;
const VISIBLE_COUNT = 4.5;
const AVATAR_CARD_WIDTH = (SCREEN_WIDTH - AVATAR_HORIZONTAL_PADDING * 2 - AVATAR_GAP * (VISIBLE_COUNT - 0.5)) / VISIBLE_COUNT;

const VOICE_GAP = 8;
const VOICE_HORIZONTAL_PADDING = 8;
const VOICE_VISIBLE_COUNT = 3;
const VOICE_CARD_WIDTH = (SCREEN_WIDTH - VOICE_HORIZONTAL_PADDING * 2 - VOICE_GAP * (VOICE_VISIBLE_COUNT - 0.5)) / VOICE_VISIBLE_COUNT;

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

  // Avatar character edit
  const [selectedAvatarId, setSelectedAvatarId] = useState<number | null>(null);
  const [avatarCharName, setAvatarCharName] = useState('');

  // Personality sliders
  const [empathy, setEmpathy] = useState(50);
  const [intuition, setIntuition] = useState(50);
  const [logic, setLogic] = useState(50);
  const personalityLoaded = useRef(false);

  // Voice preview audio
  const [audioSource, setAudioSource] = useState<string | null>(null);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [selectedVoiceId, setSelectedVoiceId] = useState<number | null>(null);

  const player = useAudioPlayer(audioSource ?? undefined);
  const playerStatus = useAudioPlayerStatus(player);
  const isPlaying = playerStatus.playing;
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  useAudioSampleListener(player, useCallback((sample: { channels?: { frames: number[] }[] }) => {
    if (!isPlayingRef.current) return;
    if (sample.channels && sample.channels.length > 0) {
      const rms = calcRMS(sample.channels[0].frames);
      setVoiceVolume(rms);
    }
  }, []));

  useEffect(() => {
    if (!isPlaying) setVoiceVolume(0);
  }, [isPlaying]);

  // audioSource 변경 시 자동 재생
  useEffect(() => {
    if (audioSource && player) {
      player.seekTo(0);
      player.play();
    }
  }, [audioSource]);

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
        const langId = profile?.profile?.native_language?.id;
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
          title="앱 언어"
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
                  await saveProfile({ app_locale: item.code });
                  goBack('account');
                }}
              >
                <Text style={styles.rowLabel}>{item.name_native}</Text>
                {currentLocale === item.code && (
                  <Ionicons name="checkmark" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
          />
        )}
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
    const currentSelectedId = selectedAvatarId ?? avatarData?.id ?? null;
    const selectedAvatar = avatars.find((a) => a.id === currentSelectedId);
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="캐릭터 변경"
          left={<TouchableOpacity onPress={() => goBack('avatar')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        {seedLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <View style={styles.avatarEditContent}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.avatarScrollContent}
              style={styles.avatarScroll}
            >
              {avatars.map((avatar) => (
                <TouchableOpacity
                  key={avatar.id}
                  style={[
                    styles.avatarCard,
                    { borderColor: currentSelectedId === avatar.id ? colors.primary : colors.border },
                    currentSelectedId === avatar.id && styles.avatarCardSelected,
                  ]}
                  onPress={() => {
                    setSelectedAvatarId(avatar.id);
                    setAvatarCharName(avatar.name);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.avatarImageContainer,
                      { backgroundColor: avatar.primary_color + '20' },
                    ]}
                  >
                    {avatar.thumbnail_url ? (
                      <Image
                        source={{ uri: `${API_BASE_URL}/${avatar.thumbnail_url.replace(/^\//, '')}` }}
                        style={styles.avatarCardImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="person" size={28} color={avatar.primary_color} />
                    )}
                  </View>
                  <Text style={styles.avatarCardName}>{avatar.name}</Text>
                  {currentSelectedId === avatar.id && (
                    <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modelPreview}>
              <View style={styles.nameInputRow}>
                <Ionicons name="pencil" size={20} color={colors.textSecondary} />
                <TextInput
                  style={styles.nameInput}
                  value={avatarCharName}
                  onChangeText={setAvatarCharName}
                  onBlur={() => {
                    if (!avatarCharName.trim()) {
                      setAvatarCharName(selectedAvatar?.name ?? '');
                    }
                  }}
                  placeholder={selectedAvatar?.name ?? '이름 입력'}
                  placeholderTextColor={colors.textTertiary}
                  maxLength={20}
                />
              </View>
              {currentSelectedId ? (
                <Live2DAvatar
                  voiceState="idle"
                  volume={0}
                  color={selectedAvatar?.primary_color}
                  modelUrl={selectedAvatar?.model_url ?? undefined}
                />
              ) : (
                <Text style={styles.modelPreviewPlaceholder}>
                  아바타를 선택해주세요
                </Text>
              )}
            </View>

            <View style={styles.avatarFooter}>
              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.disabledBtn]}
                onPress={async () => {
                  if (!currentSelectedId) return;
                  const name = avatarCharName.trim() || selectedAvatar?.name;
                  await saveProfile({ avatar_id: currentSelectedId, avatar_name: name });
                  setSelectedAvatarId(null);
                  setAvatarCharName('');
                  goBack('avatar');
                }}
                disabled={saving || !currentSelectedId}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── 3depth: Avatar voice ──────────────────────────────────────────────────
  if (screen === 'avatarVoice') {
    const currentVoiceId = selectedVoiceId ?? voiceData?.id ?? null;
    const selectedVoice = voices.find((v) => v.id === currentVoiceId) ?? null;
    const genderLabel = (g: string) => (g === 'male' ? '남성' : g === 'female' ? '여성' : g);

    const handleVoiceSelect = (voice: Voice) => {
      setSelectedVoiceId(voice.id);
      if (voice.sample_url) {
        setAudioSource(`${API_BASE_URL}${voice.sample_url}`);
      }
    };

    const handleVoiceReplay = () => {
      if (player) {
        player.seekTo(0);
        player.play();
      }
    };

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="목소리 설정"
          left={<TouchableOpacity onPress={() => {
            player?.pause();
            setSelectedVoiceId(null);
            setAudioSource(null);
            goBack('avatar');
          }}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        {seedLoading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <View style={styles.voiceEditContent}>
            {/* 가로 스크롤 카드 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.voiceScrollContent}
              style={styles.voiceScroll}
            >
              {voices.map((voice) => (
                <TouchableOpacity
                  key={voice.id}
                  style={[
                    styles.voiceCard,
                    { borderColor: currentVoiceId === voice.id ? colors.primary : colors.border },
                    currentVoiceId === voice.id && styles.voiceCardSelected,
                  ]}
                  onPress={() => handleVoiceSelect(voice)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.voiceIconContainer,
                    { backgroundColor: voice.gender === 'male' ? '#E3F2FD' : '#FCE4EC' },
                  ]}>
                    <Ionicons
                      name={voice.gender === 'male' ? 'man' : 'woman'}
                      size={20}
                      color={voice.gender === 'male' ? '#1976D2' : '#E91E63'}
                    />
                  </View>
                  <View style={styles.voiceTextContainer}>
                    <Text style={styles.voiceName}>{voice.name}</Text>
                    {voice.tone && <Text style={styles.voiceTone}>{voice.tone}</Text>}
                  </View>
                  {currentVoiceId === voice.id && (
                    <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 미리보기 영역 */}
            <View style={styles.voicePreviewArea}>
              {selectedVoice && (
                <View style={styles.voiceInfoRow}>
                  <Text style={styles.voiceInfoName}>{selectedVoice.name}</Text>
                  <View style={styles.genderBadge}>
                    <Text style={styles.genderText}>{genderLabel(selectedVoice.gender)}</Text>
                  </View>
                  {selectedVoice.sample_url && (
                    <TouchableOpacity
                      style={styles.replayButton}
                      onPress={handleVoiceReplay}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isPlaying ? 'stop' : 'volume-high'}
                        size={18}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {selectedVoice?.description && (
                <Text style={styles.voiceDescriptionText}>{selectedVoice.description}</Text>
              )}
              <View style={styles.voiceAvatarContainer}>
                <Live2DAvatar
                  voiceState={isPlaying ? 'ai_speaking' : 'idle'}
                  volume={voiceVolume}
                  color={avatarData?.primary_color}
                  modelUrl={avatarData?.model_url ?? undefined}
                />
              </View>
            </View>

            {/* 저장 버튼 */}
            <View style={styles.avatarFooter}>
              <TouchableOpacity
                style={[styles.primaryBtn, (saving || !currentVoiceId) && styles.disabledBtn]}
                onPress={async () => {
                  if (!currentVoiceId) return;
                  player?.pause();
                  await saveProfile({ voice_id: currentVoiceId });
                  setSelectedVoiceId(null);
                  setAudioSource(null);
                  goBack('avatar');
                }}
                disabled={saving || !currentVoiceId}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>저장</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── 3depth: Personality sliders ───────────────────────────────────────────
  if (screen === 'avatarPersonality') {
    const clampVal = (v: number) => Math.max(0, Math.min(100, v));
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="성격 설정"
          left={<TouchableOpacity onPress={() => goBack('avatar')}><Ionicons name="chevron-back" size={24} color={colors.text} /></TouchableOpacity>}
        />
        <View style={styles.personalityContent}>
          <Text style={styles.personalityDescription}>
            슬라이더를 드래그하여 AI 친구의 성격을 조절하세요.
          </Text>
          <View style={styles.personalitySlidersContainer}>
            <PersonalityRow
              label="공감"
              emoji="❤️"
              value={empathy}
              color="#FF6B6B"
              onIncrement={() => setEmpathy((v) => clampVal(v + 5))}
              onDecrement={() => setEmpathy((v) => clampVal(v - 5))}
              onValueChange={setEmpathy}
            />
            <PersonalityRow
              label="직관"
              emoji="💡"
              value={intuition}
              color="#FFD93D"
              onIncrement={() => setIntuition((v) => clampVal(v + 5))}
              onDecrement={() => setIntuition((v) => clampVal(v - 5))}
              onValueChange={setIntuition}
            />
            <PersonalityRow
              label="논리"
              emoji="🧠"
              value={logic}
              color="#6BCB77"
              onIncrement={() => setLogic((v) => clampVal(v + 5))}
              onDecrement={() => setLogic((v) => clampVal(v - 5))}
              onValueChange={setLogic}
            />
          </View>
        </View>
        <View style={styles.avatarFooter}>
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
        </View>
      </SafeAreaView>
    );
  }

  // ── 3depth: Learning language ─────────────────────────────────────────────
  if (screen === 'learningLanguage') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="학습 언어"
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
                  await saveProfile({ target_language_id: item.id });
                  goBack('account');
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
              icon="key-outline"
              label="로그인 방식"
              value={profile?.social_provider ?? '-'}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>언어 설정</Text>
            <RowItem
              icon="globe-outline"
              label="앱 언어"
              value={profile?.profile?.app_locale ?? '-'}
              onPress={() => goTo('appLocale', 'languages')}
            />
            <RowItem
              icon="language-outline"
              label="모국어"
              value={nativeLang?.name_native ?? '-'}
              onPress={() => goTo('nativeLanguage', 'languages')}
            />
            <RowItem
              icon="book-outline"
              label="학습 언어"
              value={targetLang?.name_native ?? '-'}
              onPress={() => goTo('learningLanguage', 'languages')}
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
              value={profile?.profile?.avatar_name ?? avatarData?.name ?? '-'}
              onPress={() => {
                setSelectedAvatarId(avatarData?.id ?? null);
                setAvatarCharName(profile?.profile?.avatar_name ?? avatarData?.name ?? '');
                goTo('avatarCharacter', 'avatars');
              }}
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
              value={profile?.profile?.pronunciation_voice?.name ?? '-'}
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
  // Personality (step4 style)
  personalityContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  personalityDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  personalitySlidersContainer: {
    gap: spacing.lg,
  },
  // Avatar character edit (step2 style)
  avatarEditContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  avatarScroll: {
    flexGrow: 0,
    marginBottom: spacing.lg,
  },
  avatarScrollContent: {
    paddingHorizontal: 8,
    gap: 8,
    flexGrow: 1,
    justifyContent: 'center',
  },
  avatarCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
    width: AVATAR_CARD_WIDTH,
    position: 'relative',
    ...shadows.sm,
  },
  avatarCardSelected: {
    ...shadows.md,
  },
  avatarImageContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 4,
  },
  avatarCardImage: {
    width: 48,
    height: 48,
  },
  avatarCardName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelPreview: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modelPreviewPlaceholder: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  nameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.sm,
    borderBottomWidth: 3,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  nameInput: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 2,
    paddingLeft: 0,
    paddingVertical: 4,
    minWidth: 80,
    maxWidth: 160,
  },
  avatarFooter: {
    paddingVertical: spacing.md,
  },
  // Voice edit (step3 style)
  voiceEditContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  voiceScroll: {
    flexGrow: 0,
    marginBottom: spacing.lg,
  },
  voiceScrollContent: {
    paddingHorizontal: VOICE_HORIZONTAL_PADDING,
    gap: VOICE_GAP,
  },
  voiceCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    width: VOICE_CARD_WIDTH,
    position: 'relative',
    gap: 6,
    ...shadows.sm,
  },
  voiceCardSelected: {
    ...shadows.md,
  },
  voiceIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceTextContainer: {
    flex: 1,
  },
  voiceName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  voiceTone: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
  },
  voicePreviewArea: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  voiceInfoName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  genderBadge: {
    backgroundColor: colors.primaryLight + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  genderText: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    fontWeight: '500',
  },
  replayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceDescriptionText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: spacing.md,
  },
  voiceAvatarContainer: {
    flex: 1,
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
