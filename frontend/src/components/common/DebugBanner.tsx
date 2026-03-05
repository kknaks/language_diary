import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface LogEntry {
  time: string;
  type: 'info' | 'error' | 'warn';
  message: string;
}

const logs: LogEntry[] = [];
const MAX_LOGS = 50;
const listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

/** 앱 어디서든 호출 가능한 디버그 로거 */
export function debugLog(type: LogEntry['type'], message: string) {
  const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  logs.unshift({ time, type, message });
  if (logs.length > MAX_LOGS) logs.pop();
  notifyListeners();
}

/** 네트워크 요청 래퍼 — fetch를 감싸서 자동 로깅 */
export async function debugFetch(url: string, options?: RequestInit): Promise<Response> {
  const method = options?.method ?? 'GET';
  debugLog('info', `→ ${method} ${url}`);

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.clone().text().catch(() => '');
      debugLog('error', `← ${res.status} ${url} ${body.slice(0, 200)}`);
    } else {
      debugLog('info', `← ${res.status} ${url}`);
    }
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    debugLog('error', `✘ ${method} ${url} ${msg}`);
    throw err;
  }
}

/** 화면 하단 디버그 오버레이 (토글 가능) */
export default function DebugBanner() {
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const errorCount = logs.filter((l) => l.type === 'error').length;
  const currentLogs = [...logs]; // snapshot

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.toggle, errorCount > 0 && styles.toggleError]}
        onPress={() => setVisible(!visible)}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleText}>
          {visible ? '🔽 닫기' : `🐛 Debug (${errorCount} errors, ${logs.length} logs)`}
        </Text>
      </TouchableOpacity>

      {visible && (
        <View style={styles.panel}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
          >
            {currentLogs.length === 0 ? (
              <Text style={styles.empty}>로그 없음</Text>
            ) : (
              currentLogs.map((log, i) => (
                <Text
                  key={`${tick}-${i}`}
                  style={[
                    styles.log,
                    log.type === 'error' && styles.logError,
                    log.type === 'warn' && styles.logWarn,
                  ]}
                  selectable
                >
                  {log.time} [{log.type}] {log.message}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
  },
  toggle: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  toggleError: {
    backgroundColor: 'rgba(220,50,50,0.85)',
  },
  toggleText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: '#111',
    width: '95%',
    borderRadius: 10,
    marginTop: 6,
    maxHeight: 260,
  },
  scroll: {
    maxHeight: 260,
  },
  scrollContent: {
    padding: 12,
  },
  empty: { color: '#888', fontSize: 12, textAlign: 'center', padding: 20 },
  log: { color: '#ddd', fontSize: 11, fontFamily: 'Courier', marginBottom: 4, lineHeight: 16 },
  logError: { color: '#ff6b6b' },
  logWarn: { color: '#ffd43b' },
});
