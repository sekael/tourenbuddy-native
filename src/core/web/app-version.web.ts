import Constants from 'expo-constants';

import { env } from '@/core/env';

/**
 * The running build as shown to users (the PWA's `appVersionLabel`): the release version, plus the
 * short commit on PR previews (`EXPO_PUBLIC_BUILD_COMMIT`) or "dev" locally.
 */
export function appVersionLabel(
  version: string = Constants.expoConfig?.version ?? '0.0.0',
  commit: string | undefined = env.EXPO_PUBLIC_BUILD_COMMIT,
  isDev: boolean = __DEV__,
): string {
  if (commit) return `${version} · ${commit.slice(0, 7)}`;
  return isDev ? `${version} · dev` : version;
}
