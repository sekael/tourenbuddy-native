import { Stack } from 'expo-router';

import { color } from '@/core/theme/tokens';

/**
 * Sign-in, account creation and the code. Every screen but the first gets the system navigation
 * bar, transparent over the photo, with the system back button (and the back gesture); the screens
 * before stay beneath it.
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
