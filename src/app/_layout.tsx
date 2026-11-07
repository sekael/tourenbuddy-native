import '@/core/theme/load-fonts';

import { Stack } from 'expo-router';

import { sheetOptions } from '@/core/adaptive/sheet';
import { useDeviceLocale } from '@/core/i18n';
import { color } from '@/core/theme/tokens';

// A deep link straight to a sheet still has the tabs beneath it to return to.
export const unstable_settings = { anchor: '(tabs)' };

/** The tabs, with the menu destinations presented as sheets above them (and their bottom bar). */
export default function RootLayout() {
  useDeviceLocale();

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="inbox" options={sheetOptions} />
      <Stack.Screen name="contacts" options={sheetOptions} />
      <Stack.Screen name="profile" options={sheetOptions} />
      <Stack.Screen name="offline-maps" options={sheetOptions} />
      <Stack.Screen name="map-layers" options={sheetOptions} />
      <Stack.Screen name="feedback" options={sheetOptions} />
    </Stack>
  );
}
