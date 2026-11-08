import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

/**
 * Stands in for `@/core/supabase` in every test (`test/setup.ts`): auth with a session the test
 * sets, and an event emitter for the auth state listener. Realtime tests bring their own channels.
 */
type Listener = (event: AuthChangeEvent, session: Session | null) => void;

const listeners = new Set<Listener>();

export const fakeAuth = {
  /** What `getSession` returns. */
  session: null as Session | null,
  emit(event: AuthChangeEvent, session: Session | null) {
    listeners.forEach((listener) => listener(event, session));
  },
  reset() {
    listeners.clear();
    fakeAuth.session = null;
    Object.values(supabase.auth).forEach((fn) => fn.mockClear());
  },
};

export function testSession(email = 'anna@example.com'): Session {
  return {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      email,
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-11-08T00:00:00Z',
    },
  };
}

export const supabase = {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: fakeAuth.session }, error: null })),
    onAuthStateChange: jest.fn((listener: Listener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signInWithOtp: jest.fn(async (_: unknown) => ({ data: {}, error: null as unknown })),
    verifyOtp: jest.fn(
      async (_: unknown): Promise<{ data: { session: Session | null }; error: unknown }> => {
        fakeAuth.session = testSession();
        fakeAuth.emit('SIGNED_IN', fakeAuth.session);
        return { data: { session: fakeAuth.session }, error: null };
      },
    ),
    signOut: jest.fn(async (_?: unknown) => {
      fakeAuth.session = null;
      fakeAuth.emit('SIGNED_OUT', null);
      return { error: null as unknown };
    }),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  },
  // Realtime tests give these their channels.
  channel: jest.fn(),
  removeChannel: jest.fn(),
  realtime: { setAuth: jest.fn(async () => {}) },
};

export const sessionKey = 'sb-127-auth-token';
