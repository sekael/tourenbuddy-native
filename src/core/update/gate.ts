import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { z } from 'zod';
import { createStore } from 'zustand/vanilla';

import { env } from '@/core/env';
import { createLogger } from '@/core/logging/logger';
import { getCached, putCached } from '@/core/offline/entity-cache';

/**
 * The forced-update gate (update gate, D2): `tourenbuddy.ch/app-config.json` names the oldest app
 * version each platform still supports. The app checks it at start and on return to the foreground
 * (at most every 15 minutes, 5 s bound) and keeps the last good answer, so a failed fetch or a
 * broken file never locks anyone out by itself, and never lets an outdated app through once known.
 * The web is always current and never gates.
 */
export const APP_CONFIG_URL =
  env.EXPO_PUBLIC_APP_CONFIG_URL ?? 'https://tourenbuddy.ch/app-config.json';
const CACHE_KEY = 'app-config';
const TIMEOUT_MS = 5000;
const INTERVAL_MS = 15 * 60 * 1000;

const VERSION = /^\d+(\.\d+){0,2}$/;
const configSchema = z.object({
  min_supported_ios: z.string().regex(VERSION).optional(),
  min_supported_android: z.string().regex(VERSION).optional(),
  ios_store_url: z.url().nullish(),
  android_store_url: z.url().nullish(),
});
export type AppConfig = z.infer<typeof configSchema>;

const STORE_SEARCH = {
  ios: 'https://apps.apple.com/ch/search?term=TourenBuddy',
  android: 'https://play.google.com/store/search?q=TourenBuddy&c=apps',
};

const log = createLogger('UpdateGate');

/** -1, 0 or 1 by numeric major.minor.patch; missing parts count as 0, a pre-release tag is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v
      .split('-')[0]!
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Where to send an outdated app, or null when it may run. */
export function requiredUpdate(
  version: string | null,
  config: AppConfig | null,
  os: string,
): string | null {
  if (!version || !config || (os !== 'ios' && os !== 'android')) return null;
  const min = os === 'ios' ? config.min_supported_ios : config.min_supported_android;
  if (!min || compareVersions(version, min) >= 0) return null;
  return (os === 'ios' ? config.ios_store_url : config.android_store_url) ?? STORE_SEARCH[os];
}

export const updateGate = createStore(() => ({ storeUrl: null as string | null }));

let lastCheck = 0;

/** Fetches the configuration (or falls back to the last good one) and updates the gate. */
export async function checkForUpdate(now = Date.now()): Promise<void> {
  if (Platform.OS === 'web' || now - lastCheck < INTERVAL_MS) return;
  lastCheck = now;
  let config: AppConfig | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(APP_CONFIG_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    config = configSchema.parse(await response.json());
    await putCached(CACHE_KEY, config).catch(() => {});
  } catch (error) {
    log.warn('App configuration unavailable, using the last good one', error);
    config = (await getCached<AppConfig>(CACHE_KEY).catch(() => undefined)) ?? null;
  }
  updateGate.setState({
    storeUrl: requiredUpdate(Application.nativeApplicationVersion, config, Platform.OS),
  });
}

/** Test seam. */
export function resetUpdateCheck(): void {
  lastCheck = 0;
  updateGate.setState({ storeUrl: null });
}
