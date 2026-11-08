import '@/core/theme/load-fonts';

import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';

import { sheetOptions } from '@/core/adaptive/sheet';
import { useDeviceLocale } from '@/core/i18n';
import { color } from '@/core/theme/tokens';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';

// A deep link straight to a sheet still has the tabs beneath it to return to.
export const unstable_settings = { anchor: '(tabs)' };

// The launch screen stays until the session is known, so neither sign-in nor the map flashes.
void SplashScreen.preventAutoHideAsync();

/**
 * The routes follow the session, both ways, in one place: signed out, only sign-in is reachable;
 * signed in, the tabs and the sheets above them. When the session changes, Expo Router leaves the
 * screens that became unreachable, with their history. While the session is restored, under the
 * launch screen, the signed-in side stays open too (sign-in is, since nobody is signed in yet), so
 * the address the app was opened at is kept for a signed-in user instead of bouncing through
 * sign-in to the map.
 */
export default function RootLayout() {
  useDeviceLocale();
  const initialize = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);
  const signedIn = useAuthStore((state) => state.user !== null);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }}
    >
      <Stack.Protected guard={isLoading || signedIn} redirectTo="/auth">
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="inbox" options={sheetOptions} />
        <Stack.Screen name="offline-maps" options={sheetOptions} />
        <Stack.Screen name="map-layers" options={sheetOptions} />
        <Stack.Screen name="feedback" options={sheetOptions} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="auth" options={{ animation: 'fade' }} />
      </Stack.Protected>
    </Stack>
  );
}
