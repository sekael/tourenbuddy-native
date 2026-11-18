import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

/**
 * Stands in for `@/core/supabase` in every test (`test/setup.ts`): auth with a session the test
 * sets, and an event emitter for the auth state listener. Realtime tests bring their own channels.
 * Each sign-in succeeds by default, as auth-js does: it saves the session and emits `SIGNED_IN`.
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
    for (const fn of [...Object.values(supabase.auth), ...Object.values(supabase.auth.passkey)]) {
      if (typeof fn === 'function') fn.mockClear();
    }
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

function signedIn() {
  fakeAuth.session = testSession();
  fakeAuth.emit('SIGNED_IN', fakeAuth.session);
  return fakeAuth.session;
}

type Result<T> = Promise<{ data: T; error: unknown }>;

/** What `auth.passkey` answers: a challenge, then the verification. */
export const passkeyOptions = {
  authentication: { challenge: 'Y2hhbGxlbmdl', rpId: 'tourenbuddy.ch', allowCredentials: [] },
  registration: {
    challenge: 'Y2hhbGxlbmdl',
    rp: { id: 'tourenbuddy.ch', name: 'TourenBuddy' },
    user: { id: 'dXNlci0x', name: 'anna@example.com', displayName: 'anna@example.com' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  },
};

export const supabase = {
  auth: {
    getSession: jest.fn(async () => ({ data: { session: fakeAuth.session }, error: null })),
    onAuthStateChange: jest.fn((listener: Listener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signInWithOtp: jest.fn(async (_: unknown) => ({ data: {}, error: null as unknown })),
    verifyOtp: jest.fn(async (_: unknown): Result<{ session: Session | null }> => ({
      data: { session: signedIn() },
      error: null,
    })),
    signInWithPassword: jest.fn(async (_: unknown): Result<{ session: Session | null }> => ({
      data: { session: signedIn() },
      error: null,
    })),
    updateUser: jest.fn(async (_: unknown): Result<object> => ({ data: {}, error: null })),
    passkey: {
      startAuthentication: jest.fn(
        async (): Result<{ challenge_id: string; options: object } | null> => ({
          data: { challenge_id: 'challenge-1', options: passkeyOptions.authentication },
          error: null,
        }),
      ),
      verifyAuthentication: jest.fn(async (_: unknown): Result<{ session: Session | null }> => ({
        data: { session: signedIn() },
        error: null,
      })),
      startRegistration: jest.fn(
        async (): Result<{ challenge_id: string; options: object } | null> => ({
          data: { challenge_id: 'challenge-2', options: passkeyOptions.registration },
          error: null,
        }),
      ),
      verifyRegistration: jest.fn(async (_: unknown): Result<object | null> => ({
        data: {},
        error: null,
      })),
      list: jest.fn(
        async (): Result<{ id: string; friendly_name?: string; created_at: string }[] | null> => ({
          data: [],
          error: null,
        }),
      ),
      delete: jest.fn(async (_: unknown): Result<null> => ({ data: null, error: null })),
    },
    signOut: jest.fn(async (_?: unknown) => {
      fakeAuth.session = null;
      fakeAuth.emit('SIGNED_OUT', null);
      return { error: null as unknown };
    }),
    startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(),
  },
  // A channel that subscribes and never hears anything; realtime tests give their own.
  channel: jest.fn((_topic: string, _params?: unknown): unknown => quietChannel()),
  removeChannel: jest.fn(async (_channel: unknown) => 'ok'),
  realtime: { setAuth: jest.fn(async () => {}) },
};

/** A channel whose `.on()` chains and whose `.subscribe()` reports nothing. */
function quietChannel() {
  const channel = { on: () => channel, subscribe: () => channel, unsubscribe: async () => 'ok' };
  return channel;
}

export const sessionKey = 'sb-127-auth-token';
