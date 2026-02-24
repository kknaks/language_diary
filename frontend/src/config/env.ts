/**
 * Environment configuration.
 *
 * Uses EXPO_PUBLIC_ prefixed env vars which are inlined at build time by Metro.
 * - Development: values from `.env` (default)
 * - Production:  values from `.env.prod` (copy to `.env` before building)
 *
 * Usage: `npx expo run:ios` reads `.env` automatically via Expo's built-in
 * dotenv support (SDK 49+). No extra packages needed.
 */

export const env = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000',
  WS_BASE_URL: process.env.EXPO_PUBLIC_WS_BASE_URL ?? 'ws://localhost:8000',
} as const;

export type Env = typeof env;
