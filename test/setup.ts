// The app reads its environment once at startup (`src/core/env.ts`).
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// No backend and no Keychain in tests: the client and the session storage are fakes, which the
// tests of the real modules unmock.
jest.mock('@/core/supabase', () => require('./support/fake-supabase'));
jest.mock('@/core/auth/auth-storage', () => require('./support/fake-auth-storage'));
