import { useState, useEffect, useCallback } from 'react';

/**
 * Lightweight network status hook.
 * Uses navigator.onLine and online/offline events where available (web).
 * On native, defaults to online (React Native doesn't have navigator.onLine).
 * For production, integrate @react-native-community/netinfo.
 */
export default function useNetworkStatus() {
  const [isOffline, setIsOffline] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      // Simple connectivity check by fetching a small resource
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch('https://clients3.google.com/generate_204', {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    }
  }, []);

  useEffect(() => {
    // Check on mount
    checkConnection();

    // Periodic check every 30 seconds
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  return { isOffline, checkConnection };
}
