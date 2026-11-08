import { Stack } from 'expo-router';

import { color } from '@/core/theme/tokens';

/**
 * The two sign-in steps. The code screen gets the system navigation bar, transparent over the
 * photo, with the system back button (and the back gesture); the email screen stays beneath it.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerTitle: '',
        headerTintColor: color.onContrast,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
