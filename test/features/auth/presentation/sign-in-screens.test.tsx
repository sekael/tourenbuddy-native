import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { RESEND_COOLDOWN_S } from '@/features/auth/presentation/verify-otp-screen';

import { routes } from '../../../app/routes';
import { resetAuth } from '../../../support/auth';
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
const type = (label: string, text: string) =>
  act(() => fireEvent.changeText(field(label), text));

beforeEach(() => {
  resetAuth();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.useRealTimers());

describe('email screen', () => {
  beforeEach(() => renderRouter(routes, { initialUrl: '/auth' }));

  it('should offer email autofill and send from the return key', async () => {
    expect(field('Email address').props).toMatchObject({
      textContentType: 'emailAddress',
      autoComplete: 'email',
      keyboardType: 'email-address',
      autoCapitalize: 'none',
    });

    await type('Email address', 'anna@example.com');
    await act(() => fireEvent(field('Email address'), 'submitEditing'));

    expect(screen).toHavePathname('/auth/verify-otp');
  });

  it('should send once when Send is tapped twice in one frame', async () => {
    supabase.auth.signInWithOtp.mockReturnValueOnce(new Promise(() => {}));
    await type('Email address', 'anna@example.com');

    const send = swiftButton('Send Code');
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
      await pressSwift('Send Code');

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
    ['failing on the server', new AuthApiError('boom', 500, 'unexpected_failure'), 'Failed to send code. Please try again.'],
  ])('should explain a send that is %s and stay', async (_, error, message) => {
    supabase.auth.signInWithOtp.mockResolvedValueOnce({ data: {}, error });

    await type('Email address', 'anna@example.com');
    await pressSwift('Send Code');

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen).toHavePathname('/auth');
  });
});

describe('code screen', () => {
  beforeEach(() => renderRouter(routes, { initialUrl: '/auth/verify-otp?email=anna%40example.com' }));

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

  it('should submit a new code on its own even if it repeats a rejected one', async () => {
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: rejected() });
    await type('Sign-in code', '123456');

    await wait(RESEND_COOLDOWN_S);
    await pressSwift('Resend code');
    await type('Sign-in code', '123456');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(2);
  });
});
