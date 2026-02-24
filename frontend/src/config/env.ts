/**
 * Environment configuration.
 *
 * Uses EXPO_PUBLIC_ prefixed env vars which are inlined at build time.
 * - Local dev: values come from `.env`
 * - EAS Build: values come from `eas.json` env per profile
 * - EAS Update: values baked in at `eas update` time
 */

export const env = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
  WS_BASE_URL: process.env.EXPO_PUBLIC_WS_BASE_URL ?? 'ws://localhost:8000',
} as const;
