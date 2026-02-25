import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { VoiceState } from '../../stores/useConversationStore';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LIVE2D_HTML = require('../../../assets/live2d/index.html');

interface Live2DAvatarProps {
  voiceState: VoiceState;
  volume: number;
  color?: string;
}

export default function Live2DAvatar({ voiceState, volume, color }: Live2DAvatarProps) {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'voiceState', data: voiceState }));
  }, [voiceState]);

  useEffect(() => {
    webViewRef.current?.postMessage(JSON.stringify({ type: 'volume', data: volume }));
  }, [volume]);

  useEffect(() => {
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
