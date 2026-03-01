import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { seedApi, API_BASE_URL } from '../../src/services/api';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import { useOnboardingPrefetch } from '../../src/stores/useOnboardingPrefetch';
import { Avatar } from '../../src/types/seed';
import StepIndicator from '../../src/components/onboarding/StepIndicator';
import Live2DAvatar from '../../src/components/conversation/Live2DAvatar';

export default function Step2Avatar() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const storedAvatarId = useOnboardingStore((s) => s.avatar_id);
  const storedAvatarName = useOnboardingStore((s) => s.avatar_name);
  const [selectedId, setSelectedId] = useState<number | null>(storedAvatarId);
  const [characterName, setCharacterName] = useState(storedAvatarName || '');

  const setAvatar = useOnboardingStore((s) => s.setAvatar);
  const cachedAvatars = useOnboardingPrefetch((s) => s.avatars);

  useEffect(() => {
    if (cachedAvatars) {
      setAvatars(cachedAvatars);
      if (cachedAvatars.length > 0 && !storedAvatarId) {
        setSelectedId(cachedAvatars[0].id);
        setCharacterName(cachedAvatars[0].name);
      }
      setLoading(false);
    } else {
      loadAvatars();
    }
  }, [cachedAvatars]);

  const loadAvatars = async () => {
    try {
      const res = await seedApi.getAvatars();
      const active = res.items.filter((a) => a.is_active);
      setAvatars(active);
      // prefetch store에도 저장 (step3에서 꺽쇠로 이동 시 사용)
      useOnboardingPrefetch.setState({ avatars: active });
      if (active.length > 0 && !storedAvatarId) {
        setSelectedId(active[0].id);
        setCharacterName(active[0].name);
      }
    } catch {
      Alert.alert('오류', '아바타 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (selectedId == null) {
      Alert.alert('선택 필요', '아바타를 선택해주세요.');
      return;
    }
    setAvatar(selectedId, characterName.trim() || avatars.find((a) => a.id === selectedId)?.name);
    router.push('/onboarding/step3-voice');
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
      <StepIndicator currentStep={2} totalSteps={5} onNext={() => {
        if (selectedId != null) {
          setAvatar(selectedId, characterName.trim() || avatars.find((a) => a.id === selectedId)?.name);
        }
      }} />

      <View style={styles.mainContent}>
        <Text style={styles.title}>어떤 친구와 함께할까요?</Text>

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
                { borderColor: selectedId === avatar.id ? colors.primary : colors.border },
                selectedId === avatar.id && styles.avatarCardSelected,
              ]}
              onPress={() => {
                setSelectedId(avatar.id);
                setCharacterName(avatar.name);
                setAvatar(avatar.id, avatar.name);
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
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="person" size={28} color={avatar.primary_color} />
                )}
              </View>
              <Text style={styles.avatarName}>{avatar.name}</Text>
              {selectedId === avatar.id && (
                <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                  <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.modelPreview}>
          <View style={styles.nameInputRow}>
            <Ionicons name="pencil" size={20} color={colors.textSecondary} style={styles.nameEditIcon} />
            <TextInput
              style={styles.nameInput}
              value={characterName}
              onChangeText={setCharacterName}
              placeholder="이름 입력"
              placeholderTextColor={colors.textSecondary}
              maxLength={20}
            />
          </View>
          {selectedId ? (
            <Live2DAvatar
              voiceState="idle"
              volume={0}
              color={avatars.find((a) => a.id === selectedId)?.primary_color}
              modelUrl={avatars.find((a) => a.id === selectedId)?.model_url ?? undefined}
            />
          ) : (
            <Text style={styles.modelPreviewPlaceholder}>
              아바타를 선택해주세요
            </Text>
          )}
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
const AVATAR_GAP = 8;
const AVATAR_HORIZONTAL_PADDING = 8;
const VISIBLE_COUNT = 4.5;
const AVATAR_CARD_WIDTH = (SCREEN_WIDTH - AVATAR_HORIZONTAL_PADDING * 2 - AVATAR_GAP * (VISIBLE_COUNT - 0.5)) / VISIBLE_COUNT;

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
  avatarScroll: {
    flexGrow: 0,
    marginBottom: spacing.lg,
  },
  avatarScrollContent: {
    paddingHorizontal: AVATAR_HORIZONTAL_PADDING,
    gap: AVATAR_GAP,
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
  avatarImage: {
    width: 48,
    height: 48,
  },
  avatarName: {
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
  nameEditIcon: {
    marginRight: 0,
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
