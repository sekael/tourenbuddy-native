import { AuthApiError, AuthRetryableFetchError, type Session } from '@supabase/supabase-js';

import { sessionTrust } from '@/core/auth/session-trust';
import i18n from '@/core/i18n';
import { SESSION_BOUND_MS, useAuthStore } from '@/features/auth/presentation/stores/auth-store';

import { resetAuth } from '../../../../support/auth';
import { authStorage, holdStorage, memory } from '../../../../support/fake-auth-storage';
import { fakeAuth, sessionKey, supabase, testSession } from '../../../../support/fake-supabase';

const offline = () => new AuthRetryableFetchError('Failed to fetch', 0);
const store = () => useAuthStore.getState();
const unverified = () => sessionTrust.getState().unverified;

/** A session as auth-js stores it: what the app adopts when the refresh is unreachable. */
function storeSession(session: Partial<Session> | string = testSession()) {
  memory.set(sessionKey, typeof session === 'string' ? session : JSON.stringify(session));
}

function failRestore(error: Error) {
  supabase.auth.getSession.mockResolvedValueOnce({
    data: { session: null },
    error,
  } as never);
}

beforeEach(() => {
  resetAuth();
  sessionTrust.setState({ unverified: false });
  for (const level of ['info', 'warn', 'error'] as const) {
    jest.spyOn(console, level).mockImplementation(() => {});
  }
});

afterEach(() => jest.useRealTimers());

describe('auth store: session restore', () => {
  it('should sign in with a restored session', async () => {
    fakeAuth.session = testSession();
    await store().initialize();

    expect(store()).toMatchObject({ user: { id: 'user-1' }, isLoading: false });
    expect(unverified()).toBe(false);
  });

  it('should start signed out without a session', async () => {
    await store().initialize();
    expect(store()).toMatchObject({ user: null, isLoading: false });
  });

  it('should adopt the stored session, unverified, when the refresh is unreachable', async () => {
    storeSession();
    failRestore(offline());

    await store().initialize();

    expect(store().user?.id).toBe('user-1');
    expect(unverified()).toBe(true);
  });

  it('should stay signed out when the server rejects the refresh token', async () => {
    storeSession();
    failRestore(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'));

    await store().initialize();

    expect(store().user).toBeNull();
    expect(unverified()).toBe(false);
  });

  it.each([
    ['no refresh token', JSON.stringify({ user: { id: 'user-1' } })],
    ['no user id', JSON.stringify({ user: {}, refresh_token: 'r' })],
    ['malformed JSON', '{"user":'],
  ])('should not adopt a stored session with %s', async (_, stored) => {
    storeSession(stored);
    failRestore(offline());

    await store().initialize();

    expect(store()).toMatchObject({ user: null, isLoading: false });
  });

  it('should adopt after the bound when the refresh hangs, and apply its late result', async () => {
    jest.useFakeTimers();
    storeSession();
    supabase.auth.getSession.mockReturnValueOnce(new Promise(() => {}));

    const restoring = store().initialize();
    await jest.advanceTimersByTimeAsync(SESSION_BOUND_MS - 1);
    expect(store().isLoading).toBe(true);
    await jest.advanceTimersByTimeAsync(1);
    await restoring;

    expect(store().user?.id).toBe('user-1');
    expect(unverified()).toBe(true);

    fakeAuth.emit('TOKEN_REFRESHED', testSession());
    expect(unverified()).toBe(false);
  });

  it('should not read the session, nor start the bound, before a prewarmed launch is opened', async () => {
    jest.useFakeTimers();
    const open = holdStorage();
    fakeAuth.session = testSession();

    const restoring = store().initialize();
    await jest.advanceTimersByTimeAsync(SESSION_BOUND_MS * 2);
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(store().isLoading).toBe(true);

    open();
    await restoring;
    expect(store()).toMatchObject({ user: { id: 'user-1' }, isLoading: false });
  });

  it('should start signed out, not hang, when reading the session fails', async () => {
    supabase.auth.getSession.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await store().initialize();

    expect(store()).toMatchObject({ user: null, isLoading: false });
  });

  it('should restore once, however often it is asked', async () => {
    await Promise.all([store().initialize(), store().initialize()]);
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
    expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1);
  });
});

describe('auth store: auth events', () => {
  beforeEach(async () => {
    storeSession();
    failRestore(offline());
    await store().initialize();
  });

  it('should keep the adopted session when the load replays without one', () => {
    fakeAuth.emit('INITIAL_SESSION', null);
    expect(store().user?.id).toBe('user-1');
    expect(unverified()).toBe(true);
  });

  it('should sign out when the server ends the session', () => {
    fakeAuth.emit('SIGNED_OUT', null);
    expect(store().user).toBeNull();
    expect(unverified()).toBe(false);
  });
});

describe('auth store: sign-in', () => {
  it.each([
    ['de-CH', 'de'],
    ['en', 'en'],
  ])('should send the code with the base language of %s', async (language, locale) => {
    await i18n.changeLanguage(language);
    await store().sendEmailOtp('anna@example.com');

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      options: { data: { locale } },
    });
    await i18n.changeLanguage('en');
  });

  it('should hand a send error to the screen', async () => {
    const error = new AuthApiError('rate limited', 429, 'over_email_send_rate_limit');
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error });
    await expect(store().sendEmailOtp('anna@example.com')).rejects.toBe(error);
  });

  it('should verify the code as an email OTP and hand a rejection to the screen', async () => {
    const error = new AuthApiError('Token has expired or is invalid', 403, 'otp_expired');
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error });

    await expect(store().verifyOtp('anna@example.com', '123456')).rejects.toBe(error);
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      token: '123456',
      type: 'email',
    });
  });
});

describe('auth store: sign-out', () => {
  beforeEach(async () => {
    storeSession();
    failRestore(offline());
    await store().initialize();
  });

  it('should sign out at once, before the server answers', async () => {
    supabase.auth.signOut.mockReturnValueOnce(new Promise(() => {}));
    jest.useFakeTimers();

    const signingOut = store().signOut();

    expect(store().user).toBeNull();
    expect(unverified()).toBe(false);
    await jest.advanceTimersByTimeAsync(SESSION_BOUND_MS);
    await signingOut;
    // auth-js never got to it (offline, waiting out its startup refresh): deleted here instead.
    expect(memory.has(sessionKey)).toBe(false);
  });

  it('should delete the stored session when the server cannot be reached', async () => {
    supabase.auth.signOut.mockResolvedValueOnce({ error: offline() });
    await store().signOut();
    expect(memory.has(sessionKey)).toBe(false);
  });

  it('should never throw, even when storage fails', async () => {
    supabase.auth.signOut.mockRejectedValueOnce(new Error('boom'));
    authStorage.removeItem.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(store().signOut()).resolves.toBeUndefined();
    expect(store().user).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      '[AuthStore]',
      'Could not delete the stored session',
      expect.any(Error),
    );
  });
});
