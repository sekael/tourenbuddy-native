import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';

import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { RESEND_COOLDOWN_S } from '@/features/auth/presentation/verify-otp-screen';

import { routes } from '../../../app/routes';
import { resetAuth } from '../../../support/auth';
import { Passkey, sheetError } from '../../../support/fake-passkey';
import { supabase } from '../../../support/fake-supabase';
import { isSwiftDisabled, pressSwift, swiftButton } from '../../../support/swift-ui';

const offline = () => new AuthRetryableFetchError('Failed to fetch', 0);
const rejected = () => new AuthApiError('Token has expired or is invalid', 403, 'otp_expired');
const rateLimited = (seconds: number) =>
  new AuthApiError(
    `For security purposes, you can only request this after ${seconds} seconds.`,
    429,
    'over_email_send_rate_limit',
  );

const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, text: string) => act(() => fireEvent.changeText(field(label), text));

beforeEach(() => {
  resetAuth();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.useRealTimers());

describe('sign-in screen: email code', () => {
  beforeEach(() => renderRouter(routes, { initialUrl: '/auth' }));

  it('should pair the email and the password for AutoFill', () => {
    expect(field('Email address').props).toMatchObject({
      textContentType: 'username',
      autoComplete: 'username',
      keyboardType: 'email-address',
      autoCapitalize: 'none',
      returnKeyType: 'next',
    });
    expect(field('Password').props).toMatchObject({
      textContentType: 'password',
      autoComplete: 'current-password',
      secureTextEntry: true,
      returnKeyType: 'go',
    });
  });

  it('should send the code to the address and ignore the password', async () => {
    await type('Email address', ' anna@example.com ');
    await type('Password', 'whatever');
    await pressSwift('Email me a code');

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'anna@example.com' }),
    );
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(screen).toHavePathname('/auth/verify-otp');
  });

  it('should send once when Send is tapped twice in one frame', async () => {
    supabase.auth.signInWithOtp.mockReturnValueOnce(new Promise(() => {}));
    await type('Email address', 'anna@example.com');

    const send = swiftButton('Email me a code');
    await act(async () => {
      send.props.onButtonPress();
      send.props.onButtonPress();
    });

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it.each(['anna', 'anna@example', 'an na@example.com', ''])(
    'should reject %j without calling the server',
    async (email) => {
      await type('Email address', email);
      await pressSwift('Email me a code');

      expect(screen.getByText('Please enter a valid email address')).toBeOnTheScreen();
      expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['offline', offline(), "This action isn't available offline"],
    ['rate limited', rateLimited(42), 'Please wait 42 seconds before requesting another code.'],
    [
      'rejected by the server',
      new AuthApiError('Email address is invalid', 400, 'email_address_invalid'),
      'Please enter a valid email address',
    ],
    [
      'failing on the server',
      new AuthApiError('boom', 500, 'unexpected_failure'),
      'Failed to send code. Please try again.',
    ],
  ])('should explain a send that is %s and stay', async (_, error, message) => {
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error });

    await type('Email address', 'anna@example.com');
    await pressSwift('Email me a code');

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen).toHavePathname('/auth');
  });
});

describe('sign-in screen: password', () => {
  beforeEach(() => renderRouter(routes, { initialUrl: '/auth' }));

  const signIn = async (email: string, password: string) => {
    await type('Email address', email);
    await type('Password', password);
    await pressSwift('Sign in');
  };

  it('should sign in with the password and open the map', async () => {
    await signIn('anna@example.com ', 'secret-123');

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.com',
      password: 'secret-123',
    });
    expect(screen).toHavePathname('/');
  });

  it("should sign in from the password field's return key", async () => {
    await type('Email address', 'anna@example.com');
    await type('Password', 'secret-123');
    await act(() => fireEvent(field('Password'), 'submitEditing'));

    expect(supabase.auth.signInWithPassword).toHaveBeenCalled();
  });

  it('should ask for the password without calling the server', async () => {
    await signIn('anna@example.com', '');

    expect(screen.getByText('Please enter your password')).toBeOnTheScreen();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('should reject an invalid address without calling the server', async () => {
    await signIn('anna@example', 'secret-123');

    expect(screen.getByText('Please enter a valid email address')).toBeOnTheScreen();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    [
      'wrong',
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      'Wrong email or password. No password yet? Use “Email me a code”.',
    ],
    [
      'for an unconfirmed account',
      new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'),
      "This address isn't confirmed yet. Use “Email me a code” to confirm it.",
    ],
    [
      'rate limited',
      new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'),
      'Too many attempts. Please wait a moment and try again.',
    ],
    ['offline', offline(), "This action isn't available offline"],
    [
      'failing',
      new AuthApiError('boom', 500, 'unexpected_failure'),
      'Sign-in failed. Please try again.',
    ],
  ])(
    'should explain a password sign-in that is %s and keep the email',
    async (_, error, message) => {
      supabase.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error });

      await signIn('anna@example.com', 'secret-123');

      expect(screen.getByText(message)).toBeOnTheScreen();
      expect(field('Email address')).toHaveDisplayValue('anna@example.com');
      expect(screen).toHavePathname('/auth');
    },
  );

  it('should not start a second sign-in while one runs, by any way', async () => {
    supabase.auth.signInWithPassword.mockReturnValueOnce(new Promise(() => {}));
    await type('Email address', 'anna@example.com');
    await type('Password', 'secret-123');

    const signInButton = swiftButton('Sign in');
    await act(async () => {
      signInButton.props.onButtonPress();
      signInButton.props.onButtonPress();
    });
    await pressSwift('Email me a code');

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    expect(isSwiftDisabled(swiftButton('Signing in…'))).toBe(true);
  });

  it('should carry the typed address over to account creation', async () => {
    await type('Email address', 'anna@example.com ');
    await pressSwift('Create account');

    expect(screen).toHavePathname('/auth/sign-up');
    expect(field('Email address')).toHaveDisplayValue('anna@example.com');
  });
});

describe('sign-in screen: passkey', () => {
  beforeEach(() => renderRouter(routes, { initialUrl: '/auth' }));

  it('should sign in with a passkey, without an email, and open the map', async () => {
    await pressSwift('Sign in with passkey');

    expect(supabase.auth.passkey.verifyAuthentication).toHaveBeenCalled();
    expect(screen).toHavePathname('/');
  });

  it('should say nothing when the sheet is cancelled', async () => {
    Passkey.get.mockRejectedValueOnce(sheetError('UserCancelled'));

    await pressSwift('Sign in with passkey');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen).toHavePathname('/auth');
  });

  it.each([
    [
      'no passkey on the device',
      () => Passkey.get.mockRejectedValueOnce(sheetError('NoCredentials')),
      "There's no passkey for TourenBuddy on this device. Sign in with your password or a code.",
    ],
    [
      'a passkey the server no longer knows',
      () =>
        supabase.auth.passkey.verifyAuthentication.mockResolvedValueOnce({
          data: { session: null },
          error: new AuthApiError('not found', 404, 'webauthn_credential_not_found'),
        }),
      'This passkey is no longer valid. Sign in with your password or a code.',
    ],
    [
      'an app the domain does not list',
      () => Passkey.get.mockRejectedValueOnce(sheetError('BadConfiguration')),
      "The passkey didn't work. Please try again.",
    ],
  ])('should explain %s', async (_, arrange, message) => {
    arrange();

    await pressSwift('Sign in with passkey');

    expect(screen.getByText(message)).toBeOnTheScreen();
  });
});

describe('account creation screen', () => {
  beforeEach(() => renderRouter(routes, { initialUrl: '/auth/sign-up' }));

  const create = async (email: string, password: string) => {
    await type('Email address', email);
    await type('New password', password);
    await pressSwift('Create account');
  };

  it('should let iOS suggest and save a strong password for the address', () => {
    expect(field('Email address').props).toMatchObject({ textContentType: 'username' });
    expect(field('New password').props).toMatchObject({
      textContentType: 'newPassword',
      autoComplete: 'new-password',
      passwordRules: 'minlength: 8;',
      secureTextEntry: true,
    });
  });

  it('should send the code and open the code screen, without setting the password yet', async () => {
    await create(' anna@example.com', 'chosen-123');

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'anna@example.com' }),
    );
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(screen).toHavePathname('/auth/verify-otp');
    expect(screen.getByText('anna@example.com')).toBeOnTheScreen();
  });

  it.each([
    ['anna@example', 'chosen-123', 'Please enter a valid email address'],
    ['anna@example.com', 'short12', 'Use at least 8 characters'],
  ])('should refuse %j with %j without calling the server', async (email, password, message) => {
    await create(email, password);

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each([
    ['offline', offline(), "This action isn't available offline"],
    ['rate limited', rateLimited(42), 'Please wait 42 seconds before requesting another code.'],
  ])('should explain a code that cannot be sent (%s) and stay', async (_, error, message) => {
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error });

    await create('anna@example.com', 'chosen-123');

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen).toHavePathname('/auth/sign-up');
  });

  it('should send once when Create account is tapped twice in one frame', async () => {
    supabase.auth.signInWithOtp.mockReturnValueOnce(new Promise(() => {}));
    await type('Email address', 'anna@example.com');
    await type('New password', 'chosen-123');

    const button = swiftButton('Create account');
    await act(async () => {
      button.props.onButtonPress();
      button.props.onButtonPress();
    });

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('should tell a user signed in without the password where to set it', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error: offline() });

    await create('anna@example.com', 'chosen-123');
    await type('Sign-in code', '123456');

    expect(screen).toHavePathname('/');
    expect(alert).toHaveBeenCalledWith(
      'Password not saved',
      "You're signed in, but your password couldn't be saved. Set it in Profile → Password.",
    );
  });
});

describe('code screen', () => {
  beforeEach(() =>
    renderRouter(routes, { initialUrl: '/auth/verify-otp?email=anna%40example.com' }),
  );

  it('should take the one-time code from autofill, on a number pad, never as a credential', () => {
    expect(field('Sign-in code').props).toMatchObject({
      textContentType: 'oneTimeCode',
      autoComplete: 'one-time-code',
      keyboardType: 'number-pad',
      autoFocus: true,
    });
    expect(field('Sign-in code').props.maxLength).toBeUndefined();
  });

  it('should keep the digits of a pasted code and submit them on its own', async () => {
    await type('Sign-in code', ' 123 456\n');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ token: '123456' }),
    );
  });

  it('should not submit fewer than six digits', async () => {
    await type('Sign-in code', '12345');

    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
    expect(isSwiftDisabled(swiftButton('Verify'))).toBe(true);
  });

  it('should clear a rejected code, and not resubmit it when autofill brings it back', async () => {
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: rejected() });

    await type('Sign-in code', '123456');
    expect(screen.getByText('Invalid or expired code. Please try again.')).toBeOnTheScreen();
    expect(field('Sign-in code')).toHaveDisplayValue('');

    await type('Sign-in code', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1);

    // Still possible on purpose.
    await pressSwift('Verify');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(2);
  });

  it('should not start a second verification while one runs', async () => {
    supabase.auth.verifyOtp.mockReturnValueOnce(new Promise(() => {}));

    await type('Sign-in code', '123456');
    await type('Sign-in code', '654321');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it('should keep the code when the server is out of reach', async () => {
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: offline() });

    await type('Sign-in code', '123456');

    expect(screen.getByText("This action isn't available offline")).toBeOnTheScreen();
    expect(field('Sign-in code')).toHaveDisplayValue('123456');
  });
});

describe('resending the code', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await renderRouter(routes, { initialUrl: '/auth/verify-otp?email=anna%40example.com' });
  });

  const wait = (seconds: number) => act(() => jest.advanceTimersByTimeAsync(seconds * 1000));

  it('should cool down from 60 s, as a code was just sent', async () => {
    expect(isSwiftDisabled(swiftButton('Resend in 60s'))).toBe(true);

    await wait(RESEND_COOLDOWN_S - 1);
    expect(swiftButton('Resend in 1s')).toBeTruthy();
    const timers = jest.getTimerCount();

    await wait(1);
    expect(isSwiftDisabled(swiftButton('Resend code'))).toBe(false);
    // Nothing left to count: the screen stops ticking.
    expect(jest.getTimerCount()).toBe(timers - 1);
  });

  it("should count the time spent in Mail, when the app's timers were paused", async () => {
    jest.setSystemTime(Date.now() + 30_000);
    await wait(1);

    expect(swiftButton('Resend in 29s')).toBeTruthy();
  });

  it('should confirm a new code and cool down again', async () => {
    await wait(RESEND_COOLDOWN_S);
    await pressSwift('Resend code');

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'anna@example.com' }),
    );
    expect(screen.getByText('Code resent! Check your email.')).toBeOnTheScreen();
    expect(swiftButton('Resend in 60s')).toBeTruthy();

    await wait(1);
    expect(swiftButton('Resend in 59s')).toBeTruthy();
  });

  it("should wait out the server's rate limit instead of showing an error", async () => {
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: rateLimited(42) });

    await wait(RESEND_COOLDOWN_S);
    await pressSwift('Resend code');

    expect(swiftButton('Resend in 42s')).toBeTruthy();
    expect(screen.queryByText('Failed to resend code. Please try again.')).toBeNull();
  });

  it('should show a resend error for anything else', async () => {
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: new Error('boom') });

    await wait(RESEND_COOLDOWN_S);
    await pressSwift('Resend code');

    expect(screen.getByText('Failed to resend code. Please try again.')).toBeOnTheScreen();
  });

  it('should keep the password of an account creation through a resend', async () => {
    await act(() => useAuthStore.getState().signUp('anna@example.com', 'chosen-123'));

    await wait(RESEND_COOLDOWN_S);
    await pressSwift('Resend code');
    await type('Sign-in code', '123456');

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-123' });
  });

  it('should submit a new code on its own even if it repeats a rejected one', async () => {
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: rejected() });
    await type('Sign-in code', '123456');

    await wait(RESEND_COOLDOWN_S);
    await pressSwift('Resend code');
    await type('Sign-in code', '123456');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(2);
  });
});
