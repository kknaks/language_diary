import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface LogEntry {
  time: string;
  type: 'info' | 'error' | 'warn';
  message: string;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 50;
let _forceUpdate: (() => void) | null = null;

/** 앱 어디서든 호출 가능한 디버그 로거 */
export function debugLog(type: LogEntry['type'], message: string) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  logs.unshift({ time, type, message });
  if (logs.length > MAX_LOGS) logs.pop();
  _forceUpdate?.();
}

/** 네트워크 요청 래퍼 — fetch를 감싸서 자동 로깅 */
export async function debugFetch(url: string, options?: RequestInit): Promise<Response> {
  const method = options?.method ?? 'GET';
  debugLog('info', `→ ${method} ${url}`);

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.clone().text().catch(() => '');
      debugLog('error', `← ${res.status} ${url}\n${body.slice(0, 200)}`);
    } else {
      debugLog('info', `← ${res.status} ${url}`);
    }
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog('error', `✘ ${method} ${url}\n${msg}`);
    throw err;
  }
}

/** 화면 하단 디버그 오버레이 (토글 가능) */
export default function DebugBanner() {
  const [visible, setVisible] = useState(false);
  const [, setTick] = useState(0);
  _forceUpdate = () => setTick((t) => t + 1);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.toggle, visible && styles.toggleActive]}
        onPress={() => setVisible(!visible)}
      >
        <Text style={styles.toggleText}>
          {visible ? '🔽 Debug' : `🐛 ${logs.filter((l) => l.type === 'error').length} errors`}
        </Text>
      </TouchableOpacity>

      {visible && (
        <View style={styles.panel}>
          <ScrollView style={styles.scroll}>
            {logs.length === 0 && (
              <Text style={styles.empty}>로그 없음</Text>
            )}
            {logs.map((log, i) => (
              <Text
                key={i}
                style={[
                  styles.log,
                  log.type === 'error' && styles.logError,
                  log.type === 'warn' && styles.logWarn,
                ]}
              >
                {log.time} [{log.type}] {log.message}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
  },
  toggle: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  toggleActive: {
    backgroundColor: 'rgba(220,50,50,0.8)',
  },
  toggleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  panel: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    width: '95%',
    maxHeight: 250,
    borderRadius: 8,
    marginTop: 4,
    padding: 8,
  },
  scroll: { flex: 1 },
  empty: { color: '#888', fontSize: 11, textAlign: 'center' },
  log: { color: '#ccc', fontSize: 10, fontFamily: 'Courier', marginBottom: 2 },
  logError: { color: '#ff6b6b' },
  logWarn: { color: '#ffd43b' },
});
