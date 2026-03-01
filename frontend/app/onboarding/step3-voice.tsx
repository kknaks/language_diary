import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus, useAudioSampleListener } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { seedApi, API_BASE_URL } from '../../src/services/api';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import { useOnboardingPrefetch } from '../../src/stores/useOnboardingPrefetch';
import { Voice } from '../../src/types/seed';
import StepIndicator from '../../src/components/onboarding/StepIndicator';
import Live2DAvatar from '../../src/components/conversation/Live2DAvatar';

// PCM frames → RMS 볼륨 (0~1)
function calcRMS(frames: number[]): number {
  if (!frames || frames.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frames.length; i++) {
    sum += frames[i] * frames[i];
  }
  return Math.min(1, Math.sqrt(sum / frames.length) * 3);
}

export default function Step3Voice() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const storedVoiceId = useOnboardingStore((s) => s.voice_id);
  const [selectedId, setSelectedId] = useState<number | null>(storedVoiceId);
  const [audioSource, setAudioSource] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);

  const nativeLanguageId = useOnboardingStore((s) => s.native_language_id);
  const avatarId = useOnboardingStore((s) => s.avatar_id);
  const setVoiceStore = useOnboardingStore((s) => s.setVoice);
  const cachedVoices = useOnboardingPrefetch((s) => s.voices);
  const cachedAvatars = useOnboardingPrefetch((s) => s.avatars);

  const selectedAvatar = cachedAvatars?.find((a) => a.id === avatarId) ?? null;

  // expo-audio hook 기반 플레이어
  const player = useAudioPlayer(audioSource ?? undefined);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  // 실시간 오디오 샘플 → 볼륨 계산
  useAudioSampleListener(player, useCallback((sample) => {
    if (!isPlayingRef.current) return;
    if (sample.channels && sample.channels.length > 0) {
      const rms = calcRMS(sample.channels[0].frames);
      setVolume(rms);
    }
  }, []));

  // 재생 끝나면 볼륨 리셋
  useEffect(() => {
    if (!isPlaying) {
      setVolume(0);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (cachedVoices) {
      setVoices(cachedVoices);
      setLoading(false);
    } else {
      loadVoices();
    }
  }, [cachedVoices]);

  const loadVoices = async () => {
    try {
      const res = await seedApi.getVoices(nativeLanguageId ?? undefined);
      setVoices(res.items.filter((v) => v.is_active));
    } catch {
      Alert.alert('오류', '목소리 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (voice: Voice) => {
    setSelectedId(voice.id);
    setVoiceStore(voice.id);
    if (voice.sample_url) {
      setAudioSource(`${API_BASE_URL}${voice.sample_url}`);
    }
  };

  // audioSource가 바뀌면 자동 재생
  useEffect(() => {
    if (audioSource && player) {
      player.seekTo(0);
      player.play();
    }
  }, [audioSource]);

  const handleReplay = () => {
    if (player) {
      player.seekTo(0);
      player.play();
    }
  };

  const handleNext = () => {
    if (selectedId == null) {
      Alert.alert('선택 필요', '목소리를 선택해주세요.');
      return;
    }
    player?.pause();
    setVoiceStore(selectedId);
    router.push('/onboarding/step4-personality');
  };

  const selectedVoice = voices.find((v) => v.id === selectedId) ?? null;

  const genderLabel = (gender: string) => {
    switch (gender) {
      case 'male':
        return '남성';
      case 'female':
        return '여성';
      default:
        return gender;
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StepIndicator currentStep={3} totalSteps={5} />

      <View style={styles.mainContent}>
        <Text style={styles.title}>어떤 목소리가 좋나요?</Text>

        {/* 목소리 좌우 스크롤 */}
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
                { borderColor: selectedId === voice.id ? colors.primary : colors.border },
                selectedId === voice.id && styles.voiceCardSelected,
              ]}
              onPress={() => handleSelect(voice)}
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
                {voice.tone && (
                  <Text style={styles.voiceTone}>{voice.tone}</Text>
                )}
              </View>
              {selectedId === voice.id && (
                <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                  <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 아바타 미리보기 + 목소리 재생 영역 */}
        <View style={styles.previewArea}>
          {selectedVoice && (
            <View style={styles.voiceInfoRow}>
              <Text style={styles.voiceInfoName}>{selectedVoice.name}</Text>
              <View style={styles.genderBadge}>
                <Text style={styles.genderText}>{genderLabel(selectedVoice.gender)}</Text>
              </View>
              {selectedVoice.sample_url && (
                <TouchableOpacity
                  style={styles.replayButton}
                  onPress={handleReplay}
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

          <View style={styles.avatarContainer}>
            {selectedAvatar ? (
              <Live2DAvatar
                voiceState={isPlaying ? 'ai_speaking' : 'idle'}
                volume={volume}
                color={selectedAvatar.primary_color}
                modelUrl={selectedAvatar.model_url ?? undefined}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={64} color={colors.textTertiary} />
                <Text style={styles.placeholderText}>목소리를 선택해주세요</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextButton, !selectedId && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!selectedId}
          activeOpacity={0.7}
        >
          <Text style={styles.nextButtonText}>다음</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VOICE_GAP = 8;
const VOICE_HORIZONTAL_PADDING = 8;
const VISIBLE_COUNT = 3;
const VOICE_CARD_WIDTH = (SCREEN_WIDTH - VOICE_HORIZONTAL_PADDING * 2 - VOICE_GAP * (VISIBLE_COUNT - 0.5)) / VISIBLE_COUNT;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
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
  previewArea: {
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
  avatarContainer: {
    flex: 1,
  },
  avatarPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  nextButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadows.md,
  },
  nextButtonDisabled: {
    backgroundColor: colors.border,
  },
  nextButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
