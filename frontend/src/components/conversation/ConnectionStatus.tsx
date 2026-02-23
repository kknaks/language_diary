import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import { ConnectionStatus as ConnectionStatusType } from '../../types';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
}

const CONFIG: Record<
  Exclude<ConnectionStatusType, 'connected'>,
  { label: string; bg: string; fg: string }
> = {
  connecting: { label: '연결 중...', bg: colors.warning, fg: '#FFFFFF' },
  reconnecting: { label: '재연결 중...', bg: colors.warning, fg: '#FFFFFF' },
  disconnected: { label: '연결 끊김', bg: colors.error, fg: '#FFFFFF' },
};

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === 'connected') return null;

  const cfg = CONFIG[status];

  return (
    <View style={[styles.banner, { backgroundColor: cfg.bg }]}>
      {(status === 'connecting' || status === 'reconnecting') && (
        <ActivityIndicator size="small" color={cfg.fg} />
      )}
      <Text style={[styles.text, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
