import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { seedApi } from '../../src/services/api';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import { Avatar } from '../../src/types/seed';
import StepIndicator from '../../src/components/onboarding/StepIndicator';

export default function Step2Avatar() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const setAvatar = useOnboardingStore((s) => s.setAvatar);

  useEffect(() => {
    loadAvatars();
  }, []);

  const loadAvatars = async () => {
    try {
      const res = await seedApi.getAvatars();
      setAvatars(res.items.filter((a) => a.is_active));
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
    const avatar = avatars.find((a) => a.id === selectedId);
    setAvatar(selectedId, avatar?.name);
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
      <StepIndicator currentStep={2} totalSteps={4} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>어떤 친구와 함께할까요?</Text>

        <View style={styles.grid}>
          {avatars.map((avatar) => (
            <TouchableOpacity
              key={avatar.id}
              style={[
                styles.avatarCard,
                { borderColor: selectedId === avatar.id ? avatar.primary_color : colors.border },
                selectedId === avatar.id && styles.avatarCardSelected,
              ]}
              onPress={() => setSelectedId(avatar.id)}
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
                    source={{ uri: avatar.thumbnail_url }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Ionicons name="person" size={48} color={avatar.primary_color} />
                )}
              </View>
              <Text style={styles.avatarName}>{avatar.name}</Text>
              {selectedId === avatar.id && (
                <View style={[styles.checkBadge, { backgroundColor: avatar.primary_color }]}>
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
  },
  avatarCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    width: '45%',
    position: 'relative',
    ...shadows.sm,
  },
  avatarCardSelected: {
    ...shadows.md,
  },
  avatarImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  avatarImage: {
    width: 80,
    height: 80,
  },
  avatarName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
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
