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
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { login as kakaoLogin } from '@react-native-seoul/kakao-login';
import { getLocales } from 'expo-localization';
import Constants from 'expo-constants';
import { Svg, Path } from 'react-native-svg';
import { colors, spacing, fontSize, borderRadius, shadows } from '../src/constants/theme';
import { authApi } from '../src/services/api';
import { useAuthStore } from '../src/stores/useAuthStore';

GoogleSignin.configure({
  iosClientId: Constants.expoConfig?.extra?.googleIosClientId,
  webClientId: Constants.expoConfig?.extra?.googleWebClientId,
});

const isKoreanLocale = getLocales()[0]?.languageCode === 'ko';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleLoginSuccess = async (result: Awaited<ReturnType<typeof authApi.socialLogin>>) => {
    await useAuthStore.getState().setAuth(result.user, result);
    if (result.user.onboarding_completed) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding/step1-language');
    }
  };

  // 카카오 로그인
  const handleKakaoLogin = async () => {
    try {
      setLoading(true);
      const kakaoResult = await kakaoLogin();
      const accessToken = kakaoResult.accessToken;
      if (!accessToken) throw new Error('카카오 토큰을 받지 못했습니다.');

      const result = await authApi.socialLogin('kakao', undefined, accessToken);
      await handleLoginSuccess(result);
    } catch (e: any) {
      if (e?.message?.includes('cancelled')) return;
      const message = e instanceof Error ? e.message : '다시 시도해주세요.';
      Alert.alert('로그인 실패', message);
    } finally {
      setLoading(false);
    }
  };

  // Google 로그인
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('ID 토큰을 받지 못했습니다.');

      const result = await authApi.socialLogin('google', idToken);
      await handleLoginSuccess(result);
    } catch (e: any) {
      if (e?.code === 'SIGN_IN_CANCELLED' || e?.message?.includes('cancelled')) return;
      const message = e instanceof Error ? e.message : '다시 시도해주세요.';
      Alert.alert('로그인 실패', message);
    } finally {
      setLoading(false);
    }
  };

  // Apple 로그인
  const handleAppleLogin = async () => {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const idToken = credential.identityToken;
      if (!idToken) throw new Error('Apple ID 토큰을 받지 못했습니다.');

      const result = await authApi.socialLogin('apple', idToken);
      await handleLoginSuccess(result);
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
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
            {/* 카카오 (한국어 locale일 때만) */}
            {isKoreanLocale && (
              <TouchableOpacity
                style={styles.kakaoButton}
                onPress={handleKakaoLogin}
                activeOpacity={0.7}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="#3C1E1E">
                  <Path d="M12 3C6.48 3 2 6.36 2 10.5c0 2.63 1.76 4.96 4.42 6.3l-1.1 4.07c-.1.35.3.64.6.44l4.85-3.23c.4.03.81.05 1.23.05 5.52 0 10-3.36 10-7.5S17.52 3 12 3z" />
                </Svg>
                <Text style={styles.kakaoButtonText}>카카오로 계속하기</Text>
              </TouchableOpacity>
            )}

            {/* Google */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              activeOpacity={0.7}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24">
                <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4" />
                <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <Path d="M5.84 14.09A6.007 6.007 0 0 1 5.52 12c0-.72.12-1.43.32-2.09V7.07H2.18A10.013 10.013 0 0 0 2 12c0 1.61.39 3.14 1.07 4.49l3.77-2.4z" fill="#FBBC05" />
                <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </Svg>
              <Text style={styles.googleButtonText}>Google로 계속하기</Text>
            </TouchableOpacity>

            {/* Apple (iOS only) */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleLogin}
                activeOpacity={0.7}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24">
                  <Path
                    d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
                    fill="#FFFFFF"
                  />
                </Svg>
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
    gap: spacing.sm,
  },
  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE500',
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  kakaoButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: '#3C1E1E',
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
