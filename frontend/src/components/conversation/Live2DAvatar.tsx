import React, { useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { VoiceState } from '../../stores/useConversationStore';
import { env } from '../../config/env';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LIVE2D_HTML = require('../../../assets/live2d/index.html');

interface Live2DAvatarProps {
  voiceState: VoiceState;
  volume: number;
  color?: string;
  modelUrl?: string; // e.g. "/static/models/mark/mark_free_t04.model3.json"
}

export default function Live2DAvatar({ voiceState, volume, color, modelUrl }: Live2DAvatarProps) {
  const webViewRef = useRef<WebView>(null);
  const isLoadedRef = useRef(false);

  const sendInit = useCallback(() => {
    const fullModelUrl = modelUrl ? `${env.API_BASE_URL}${modelUrl}` : undefined;
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: 'init',
        data: { modelUrl: fullModelUrl, color: color },
      }),
    );
  }, [modelUrl, color]);

  const handleLoadEnd = useCallback(() => {
    isLoadedRef.current = true;
    sendInit();
  }, [sendInit]);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'voiceState', data: voiceState }));
  }, [voiceState]);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'volume', data: volume }));
  }, [volume]);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    if (color) {
      webViewRef.current?.postMessage(JSON.stringify({ type: 'color', data: color }));
    }
  }, [color]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={LIVE2D_HTML}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        onLoadEnd={handleLoadEnd}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'error') {
              console.error('[Live2DAvatar] WebView error:', msg.data);
            }
          } catch {}
        }}
        {...(Platform.OS === 'android' ? { mixedContentMode: 'always' } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
