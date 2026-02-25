import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../src/constants/theme';
import { authApi } from '../src/services/api';
import { useAuthStore } from '../src/stores/useAuthStore';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      // 개발 모드: 테스트용 토큰 (백엔드 GOOGLE_CLIENT_IDS 빈 리스트일 때 파싱만 하는 개발 모드 지원)
      const testIdToken = `dev_google_token.eyJzdWIiOiJnb29nbGVfdGVzdF8xMjMiLCJlbWFpbCI6InRlc3RAZ21haWwuY29tIiwibmFtZSI6IlRlc3QgVXNlciJ9.sig`;
      const response = await authApi.socialLogin('google', testIdToken);
      await useAuthStore.getState().setAuth(response.user, response);

      if (response.user.onboarding_completed) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding/step1-language');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '다시 시도해주세요.';
      Alert.alert('로그인 실패', message);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setLoading(true);
      // 개발 모드: 테스트용 Apple 토큰
      const testIdToken = `dev_apple_token.eyJzdWIiOiJhcHBsZV90ZXN0XzEyMyIsImVtYWlsIjoiYXBwbGV0ZXN0QGljbG91ZC5jb20iLCJuYW1lIjoiQXBwbGUgVXNlciJ9.sig`;
      const response = await authApi.socialLogin('apple', testIdToken);
      await useAuthStore.getState().setAuth(response.user, response);

      if (response.user.onboarding_completed) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding/step1-language');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '다시 시도해주세요.';
      Alert.alert('로그인 실패', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <View style={styles.logoContainer}>
          <Ionicons name="chatbubbles" size={64} color={colors.primary} />
          <Text style={styles.title}>Language Diary</Text>
          <Text style={styles.subtitle}>AI 친구와 함께하는{'\n'}외국어 일기 학습</Text>
        </View>
      </View>

      <View style={styles.bottomSection}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              activeOpacity={0.7}
            >
              <Ionicons name="logo-google" size={20} color="#4285F4" />
              <Text style={styles.googleButtonText}>Google로 계속하기</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleLogin}
                activeOpacity={0.7}
              >
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                <Text style={styles.appleButtonText}>Apple로 계속하기</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={styles.termsContainer}>
          <Text style={styles.termsText}>
            계속 진행하면{' '}
            <Text style={styles.termsLink}>이용약관</Text>
            {' '}및{' '}
            <Text style={styles.termsLink}>개인정보처리방침</Text>
            에 동의하는 것으로 간주됩니다.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 24,
  },
  bottomSection: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    gap: spacing.sm,
    ...shadows.sm,
  },
  googleButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    gap: spacing.sm,
    ...shadows.sm,
  },
  appleButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  termsContainer: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  termsText: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
