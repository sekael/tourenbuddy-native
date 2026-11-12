// The app reads its environment once at startup (`src/core/env.ts`).
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// No backend and no Keychain in tests: the client and the session storage are fakes, which the
// tests of the real modules unmock.
jest.mock('@/core/supabase', () => require('./support/fake-supabase'));
jest.mock('@/core/auth/auth-storage', () => require('./support/fake-auth-storage'));
// The offline database is Maps; the OS network state is NetInfo's own mock.
jest.mock('@/core/offline/tables', () => require('./support/fake-tables'));
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
// No native map or Skia: plain views and stubs (the map's logic is tested on its own).
jest.mock('@maplibre/maplibre-react-native', () => require('./support/fake-maplibre'));
jest.mock('@shopify/react-native-skia', () => require('./support/fake-skia'));
// SwiftUI's shared state has no native side under Jest: a plain holder with the same API.
jest.mock('@expo/ui/swift-ui', () => {
  const { useState } = require('react');
  return {
    ...jest.requireActual('@expo/ui/swift-ui'),
    useNativeState: <T>(initial: T) =>
      useState(() => {
        let current = initial;
        return {
          get value() {
            return current;
          },
          set value(next: T) {
            current = next;
          },
          get: () => current,
          set: (next: T) => {
            current = next;
          },
        };
      })[0],
  };
});
// No push service: permission undetermined, no taps, no token unless a test gives one.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'ios', data: 'test-token' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
}));
// No system passkey sheet either.
jest.mock('react-native-passkey', () => require('./support/fake-passkey'));
