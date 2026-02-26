import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { seedApi, API_BASE_URL } from '../../src/services/api';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import { useOnboardingPrefetch } from '../../src/stores/useOnboardingPrefetch';
import { Voice } from '../../src/types/seed';
import StepIndicator from '../../src/components/onboarding/StepIndicator';

export default function Step3Voice() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);

  const nativeLanguageId = useOnboardingStore((s) => s.native_language_id);
  const setVoice = useOnboardingStore((s) => s.setVoice);
  const cachedVoices = useOnboardingPrefetch((s) => s.voices);

  useEffect(() => {
    if (cachedVoices) {
      setVoices(cachedVoices);
      setLoading(false);
    } else {
      loadVoices();
    }
    return () => {
      subscriptionRef.current?.remove();
      playerRef.current?.release();
    };
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

  const handlePreview = (voice: Voice) => {
    if (!voice.sample_url) {
      Alert.alert('미리듣기 불가', '이 목소리의 샘플이 없습니다.');
      return;
    }

    // 이전 플레이어 정리
    subscriptionRef.current?.remove();
    playerRef.current?.release();
    subscriptionRef.current = null;
    playerRef.current = null;

    if (playingId === voice.id) {
      setPlayingId(null);
      return;
    }

    try {
      setPlayingId(voice.id);
      const player = createAudioPlayer(`${API_BASE_URL}${voice.sample_url}`);
      playerRef.current = player;

      const sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setPlayingId(null);
        }
      });
      subscriptionRef.current = sub;

      player.play();
    } catch (err) {
      console.error('Audio playback error:', err);
      setPlayingId(null);
      Alert.alert('재생 실패', '오디오를 재생할 수 없습니다.');
    }
  };

  const handleNext = () => {
    if (selectedId == null) {
      Alert.alert('선택 필요', '목소리를 선택해주세요.');
      return;
    }
    setVoice(selectedId);
    router.push('/onboarding/step4-personality');
  };

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
      <StepIndicator currentStep={3} totalSteps={4} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>어떤 목소리가 좋나요?</Text>

        {voices.map((voice) => (
          <TouchableOpacity
            key={voice.id}
            style={[
              styles.voiceCard,
              selectedId === voice.id && styles.voiceCardSelected,
            ]}
            onPress={() => setSelectedId(voice.id)}
            activeOpacity={0.7}
          >
            <View style={styles.voiceInfo}>
              <View style={styles.voiceHeader}>
                <Text style={styles.voiceName}>{voice.name}</Text>
                <View style={styles.genderBadge}>
                  <Text style={styles.genderText}>{genderLabel(voice.gender)}</Text>
                </View>
              </View>
              {voice.tone && (
                <Text style={styles.voiceTone}>{voice.tone}</Text>
              )}
              {voice.description && (
                <Text style={styles.voiceDescription} numberOfLines={2}>
                  {voice.description}
                </Text>
              )}
            </View>

            <View style={styles.voiceActions}>
              {voice.sample_url && (
                <TouchableOpacity
                  style={styles.previewButton}
                  onPress={() => handlePreview(voice)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={playingId === voice.id ? 'stop' : 'play'}
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              )}
              {selectedId === voice.id && (
                <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
              )}
            </View>
          </TouchableOpacity>
        ))}

        {voices.length === 0 && (
          <Text style={styles.emptyText}>사용 가능한 목소리가 없습니다.</Text>
        )}
      </ScrollView>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  voiceCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.sm,
  },
  voiceCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  voiceInfo: {
    flex: 1,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  voiceName: {
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
  voiceTone: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  voiceDescription: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 4,
    lineHeight: 16,
  },
  voiceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  previewButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xxl,
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
