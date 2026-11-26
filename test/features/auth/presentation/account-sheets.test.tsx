import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, Keyboard, type AlertButton } from 'react-native';

import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';

import { routes } from '../../../app/routes';
import { signIn } from '../../../support/auth';
import { Passkey, sheetError } from '../../../support/fake-passkey';
import { supabase } from '../../../support/fake-supabase';
import {
  hasSwiftText,
  isSwiftDisabled,
  pressSwift,
  swiftButton,
  swiftButtonLabelled,
} from '../../../support/swift-ui';

// The Profile tab's password and passkey sheets, on iOS.
const passkey = supabase.auth.passkey;
const offline = () => new AuthRetryableFetchError('Failed to fetch', 0);
const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, text: string) => act(() => fireEvent.changeText(field(label), text));

beforeEach(() => {
  signIn();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('Profile tab', () => {
  it('should offer the password and the passkeys above sign-out', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });

    await pressSwift('Password');
    expect(screen).toHavePathname('/password');
  });

  it('should open the passkeys', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });

    await pressSwift('Passkeys');
    expect(screen).toHavePathname('/passkeys');
  });
});

describe('password sheet, just signed in', () => {
  // A code, password or passkey accepted moments ago in this app.
  beforeEach(() => useAuthStore.setState({ provenAt: Date.now() }));
  beforeEach(() => renderRouter(routes, { initialUrl: '/profile' }));
  beforeEach(() => pressSwift('Password'));

  it('should name the account, read-only, so iOS saves the new password for it', () => {
    expect(field('Email address').props).toMatchObject({
      value: 'anna@example.com',
      editable: false,
      textContentType: 'username',
    });
    expect(field('New password').props).toMatchObject({
      textContentType: 'newPassword',
      passwordRules: 'minlength: 8;',
      secureTextEntry: true,
    });
  });

  it('should set the password and close', async () => {
    await type('New password', 'chosen-123');
    await pressSwift('Save password');

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'chosen-123' });
    expect(screen).toHavePathname('/profile');
  });

  it('should refuse a short password without calling the server', async () => {
    await type('New password', 'short12');
    await pressSwift('Save password');

    expect(screen.getByText('Use at least 8 characters')).toBeOnTheScreen();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the same',
      new AuthApiError('same', 422, 'same_password'),
      "That's your current password. Choose a different one.",
    ],
    // What auth-js makes of the server's `weak_password`: its own class, never an API error.
    [
      'shorter than the server allows',
      new AuthWeakPasswordError('Password should be at least 10 characters.', 422, ['length']),
      'Use at least 10 characters',
    ],
    [
      'missing a kind of character',
      new AuthWeakPasswordError('Password should contain at least one character of each: …', 422, [
        'characters',
      ]),
      'Mix upper- and lowercase letters, digits and symbols.',
    ],
    [
      'known from a leak',
      new AuthWeakPasswordError('Password is known to be weak and easy to guess.', 422, ['pwned']),
      'This password is known from a data leak. Choose a different one.',
    ],
    [
      'weak for no stated reason',
      new AuthWeakPasswordError('weak', 422, []),
      'This password is too weak. Choose a stronger one.',
    ],
    ['offline', offline(), "This action isn't available offline"],
    [
      'failing',
      new AuthApiError('boom', 500, 'unexpected_failure'),
      "The password couldn't be saved. Please try again.",
    ],
  ])('should explain a password that is %s and stay open with it', async (_, error, message) => {
    supabase.auth.updateUser.mockResolvedValueOnce({ data: {}, error });

    await type('New password', 'chosen-123');
    await pressSwift('Save password');

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(field('New password')).toHaveDisplayValue('chosen-123');
    expect(screen).toHavePathname('/password');
  });

  it("should ask for the server's code when it wants one, then save with it", async () => {
    supabase.auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('reauth', 400, 'reauthentication_needed'),
    });
    await type('New password', 'chosen-123');
    await pressSwift('Save password');

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      options: { shouldCreateUser: false },
    });
    expect(screen.getByText(/we sent a 6-digit code to anna@example.com/)).toBeOnTheScreen();
    await type('Code from your email', '12345');
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
    // The sixth digit saves: the number pad has no return key.
    await type('Code from your email', '123456');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      token: '123456',
      type: 'email',
    });
    expect(supabase.auth.updateUser).toHaveBeenLastCalledWith({ password: 'chosen-123' });
    expect(screen).toHavePathname('/profile');
  });
});

describe('password sheet, the app relaunched since the sign-in', () => {
  // A restored session proves nothing, however recent the account's last sign-in elsewhere.
  beforeEach(() => useAuthStore.setState({ provenAt: undefined }));
  beforeEach(() => renderRouter(routes, { initialUrl: '/profile' }));
  beforeEach(() => pressSwift('Password'));

  it('should confirm with an emailed code before it changes anything (an unlocked phone is not enough)', async () => {
    await type('New password', 'chosen-123');
    await pressSwift('Continue');

    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      options: { shouldCreateUser: false },
    });

    await pressSwift('Save password');
    expect(screen.getByText('Enter the 6-digit code from your email.')).toBeOnTheScreen();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('should ask for the code even when the account signed in a minute ago elsewhere', async () => {
    useAuthStore.setState((s) => ({
      user: s.user && { ...s.user, last_sign_in_at: new Date().toISOString() },
    }));
    await type('New password', 'chosen-123');
    await pressSwift('Continue');

    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('should explain a wrong code, in sight, and keep the sheet open to try again', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await type('New password', 'chosen-123');
    await pressSwift('Continue');
    supabase.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
    });

    await type('Code from your email', '000000');

    expect(
      screen.getByText('That code is wrong or has expired. Send a new one and try again.'),
    ).toBeOnTheScreen();
    expect(dismiss).toHaveBeenCalled(); // the keyboard no longer covers the message
    expect(screen.getByLabelText('Code from your email').props.maxLength).toBe(6);
    expect(screen).toHavePathname('/password');
    expect(supabase.auth.updateUser).not.toHaveBeenCalled(); // a wrong code changes nothing
    await pressSwift('Send a new code');
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledTimes(2);
  });
});

describe('passkeys sheet', () => {
  const open = async () => {
    await renderRouter(routes, { initialUrl: '/profile' });
    await pressSwift('Passkeys');
  };

  it('should list the passkeys with their names, or a generic one, and the day added', async () => {
    passkey.list.mockResolvedValueOnce({
      data: [
        { id: 'p1', friendly_name: 'iCloud Keychain', created_at: '2026-11-08T10:00:00Z' },
        { id: 'p2', created_at: '2026-11-09T10:00:00Z' },
      ],
      error: null,
    });

    await open();

    expect(hasSwiftText('iCloud Keychain')).toBe(true);
    // Day and time: several passkeys often share a name.
    expect(hasSwiftText('Added on November 8, 2026')).toBe(true);
    expect(hasSwiftText('Passkey')).toBe(true);
  });

  it('should say when there are none', async () => {
    await open();
    expect(hasSwiftText('No passkeys yet.')).toBe(true);
  });

  it('should say when the list is out of reach', async () => {
    passkey.list.mockResolvedValueOnce({ data: null, error: offline() });
    await open();
    expect(hasSwiftText("This action isn't available offline")).toBe(true);
  });

  it('should add a passkey and show it', async () => {
    await open();
    passkey.list.mockResolvedValueOnce({
      data: [{ id: 'p1', friendly_name: 'iCloud Keychain', created_at: '2026-11-08T10:00:00Z' }],
      error: null,
    });

    await pressSwift('Add passkey');

    expect(Passkey.create).toHaveBeenCalled();
    expect(passkey.verifyRegistration).toHaveBeenCalled();
    expect(hasSwiftText('iCloud Keychain')).toBe(true);
  });

  it('should say nothing when adding is cancelled', async () => {
    await open();
    Passkey.create.mockRejectedValueOnce(sheetError('UserCancelled'));

    await pressSwift('Add passkey');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(passkey.verifyRegistration).not.toHaveBeenCalled();
  });

  it.each([
    [
      'already on the device',
      () => Passkey.create.mockRejectedValueOnce(sheetError('CredentialAlreadyExists')),
      'This device already has a passkey for your account.',
    ],
    [
      'one too many',
      () =>
        passkey.verifyRegistration.mockResolvedValueOnce({
          data: null,
          error: new AuthApiError('too many', 422, 'too_many_passkeys'),
        }),
      'Your account already has as many passkeys as allowed. Delete one first.',
    ],
  ])('should explain a passkey that is %s', async (_, arrange, message) => {
    await open();
    arrange();

    await pressSwift('Add passkey');

    expect(hasSwiftText(message)).toBe(true);
  });

  it('should add one passkey at a time', async () => {
    await open();
    Passkey.create.mockReturnValueOnce(new Promise(() => {}));

    const add = swiftButton('Add passkey');
    await act(async () => {
      add.props.onButtonPress();
      add.props.onButtonPress();
    });

    expect(Passkey.create).toHaveBeenCalledTimes(1);
    expect(isSwiftDisabled(swiftButton('Please wait…'))).toBe(true);
  });

  it('should delete a passkey only after the system alert confirms it', async () => {
    passkey.list.mockResolvedValueOnce({
      data: [{ id: 'p1', friendly_name: 'iCloud Keychain', created_at: '2026-11-08T10:00:00Z' }],
      error: null,
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await open();

    // The row's own delete, named with the passkey it deletes.
    await act(() =>
      fireEvent(swiftButtonLabelled('Delete iCloud Keychain, added on'), 'buttonPress'),
    );
    expect(passkey.delete).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('Delete passkey?');
    expect(message).toMatch(
      /^“iCloud Keychain”, added on November 8, 2026.*, will no longer sign you in\./,
    );
    expect(buttons.map((b) => b.style)).toEqual(['cancel', 'destructive']);

    await act(async () => buttons[1].onPress?.());

    expect(passkey.delete).toHaveBeenCalledWith({ passkeyId: 'p1' });
    expect(hasSwiftText('No passkeys yet.')).toBe(true);
  });
});
