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

describe('auth store: password and passkey', () => {
  beforeEach(() => store().initialize());

  it('should sign in with a password through the listener', async () => {
    await store().signInWithPassword('anna@example.com', 'secret-123');

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.com',
      password: 'secret-123',
    });
    expect(store().user?.email).toBe('anna@example.com');
  });

  it('should leave the user to the listener', async () => {
    // A session in the answer, but no event: the action itself never sets the user.
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: testSession() }, error: null });

    await store().signInWithPassword('anna@example.com', 'secret-123');

    expect(store().user).toBeNull();
  });

  it('should hand a refused password to the screen', async () => {
    const error = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
    supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error });

    await expect(store().signInWithPassword('anna@example.com', 'wrong')).rejects.toBe(error);
    expect(store().user).toBeNull();
  });

  it('should sign in with a passkey through the listener', async () => {
    await store().signInWithPasskey();
    expect(store().user?.email).toBe('anna@example.com');
  });

  it('should set a password and hand a refusal to the screen', async () => {
    await store().setPassword('new-secret-123');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-secret-123' });

    const error = new AuthApiError('same', 422, 'same_password');
    supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error });
    await expect(store().setPassword('new-secret-123')).rejects.toBe(error);
  });
});

describe('auth store: account creation', () => {
  beforeEach(() => store().initialize());

  it('should send the code like a code sign-in, and keep the password for after it', async () => {
    await i18n.changeLanguage('de-CH');
    await store().signUp('anna@example.com', 'chosen-123');
    await i18n.changeLanguage('en');

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      options: { data: { locale: 'de' } },
    });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('should set the password once the code has signed in, never before', async () => {
    await store().signUp('anna@example.com', 'chosen-123');
    supabase.auth.updateUser.mockImplementationOnce(async () => {
      // The session is there by then: the update changes the account the code proved.
      expect(store().user?.email).toBe('anna@example.com');
      return { data: {}, error: null };
    });

    expect(await store().verifyOtp('anna@example.com', '123456')).toBe('signedIn');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-123' });
  });

  it('should set it only once', async () => {
    await store().signUp('anna@example.com', 'chosen-123');
    await store().verifyOtp('anna@example.com', '123456');
    await store().verifyOtp('anna@example.com', '654321');

    expect(supabase.auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('should not set it for a code verified for another address', async () => {
    await store().signUp('anna@example.com', 'chosen-123');
    await store().verifyOtp('ben@example.com', '123456');

    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('should take the password of the latest account creation', async () => {
    await store().signUp('anna@example.com', 'first-123');
    await store().signUp('anna@example.com', 'second-123');
    await store().verifyOtp('anna@example.com', '123456');

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'second-123' });
  });

  it('should forget the password on sign-out', async () => {
    await store().signUp('anna@example.com', 'chosen-123');
    await store().signOut();
    await store().verifyOtp('anna@example.com', '123456');

    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('should keep it when the code screen resends the code', async () => {
    await store().signUp('anna@example.com', 'chosen-123');
    await store().resendEmailOtp('anna@example.com');
    await store().verifyOtp('anna@example.com', '123456');

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-123' });
  });

  it('should never set it after a code sign-in, even for the same address', async () => {
    // Create account abandoned on the code screen; later a plain "Email me a code".
    await store().signUp('anna@example.com', 'chosen-123');
    await store().sendEmailOtp('anna@example.com');
    await store().verifyOtp('anna@example.com', '123456');

    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('should forget an earlier password when the next account creation cannot send', async () => {
    await store().signUp('anna@example.com', 'chosen-123');
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: offline() });

    await expect(store().signUp('ben@example.com', 'other-123')).rejects.toThrow();
    await store().verifyOtp('anna@example.com', '123456');
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('should keep nothing when the code cannot be sent', async () => {
    const error = new AuthApiError('rate limited', 429, 'over_email_send_rate_limit');
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error });

    await expect(store().signUp('anna@example.com', 'chosen-123')).rejects.toBe(error);
    await store().verifyOtp('anna@example.com', '123456');
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('should not set it when the code is rejected, and still after the next code', async () => {
    await store().signUp('anna@example.com', 'chosen-123');
    const rejected = new AuthApiError('Token has expired or is invalid', 403, 'otp_expired');
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: rejected });

    await expect(store().verifyOtp('anna@example.com', '000000')).rejects.toBe(rejected);
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();

    await store().verifyOtp('anna@example.com', '123456');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-123' });
  });

  it('should count the same password as saved', async () => {
    supabase.auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('same', 422, 'same_password'),
    });
    await store().signUp('anna@example.com', 'chosen-123');

    expect(await store().verifyOtp('anna@example.com', '123456')).toBe('signedIn');
  });

  it('should stay signed in and say so when the password does not stick', async () => {
    supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error: offline() });
    await store().signUp('anna@example.com', 'chosen-123');

    expect(await store().verifyOtp('anna@example.com', '123456')).toBe('passwordNotSaved');
    expect(store().user?.email).toBe('anna@example.com');
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
