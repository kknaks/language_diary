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
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import { colors, spacing, fontSize, borderRadius, shadows } from '../src/constants/theme';
import { authApi } from '../src/services/api';
import { useAuthStore } from '../src/stores/useAuthStore';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const [_request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
  });

  // Google 응답 처리
  const handleGoogleResponse = async () => {
    if (!response) return;
    if (response.type !== 'success') {
      if (response.type === 'error') {
        Alert.alert('로그인 실패', response.error?.message ?? '구글 로그인에 실패했습니다.');
      }
      return;
    }

    try {
      setLoading(true);
      const idToken = response.authentication?.idToken;
      if (!idToken) throw new Error('ID 토큰을 받지 못했습니다.');

      const result = await authApi.socialLogin('google', idToken);
      await useAuthStore.getState().setAuth(result.user, result);

      if (result.user.onboarding_completed) {
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

  // Google 버튼 클릭
  const handleGoogleLogin = async () => {
    await promptAsync();
    await handleGoogleResponse();
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
      await useAuthStore.getState().setAuth(result.user, result);

      if (result.user.onboarding_completed) {
        router.replace('/(tabs)');
      } else {
        router.replace('/onboarding/step1-language');
      }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return; // 유저가 취소
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
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={borderRadius.md}
                style={styles.appleButton}
                onPress={handleAppleLogin}
              />
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
    height: 50,
    width: '100%',
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
