import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';

import { routes } from '../../../app/routes';
import { signIn } from '../../../support/auth';
import { Passkey, sheetError } from '../../../support/fake-passkey';
import { supabase } from '../../../support/fake-supabase';
import { isSwiftDisabled, pressSwift, swiftButton } from '../../../support/swift-ui';

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

describe('password sheet', () => {
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
    [
      'weak',
      new AuthApiError('weak', 422, 'weak_password'),
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

    expect(screen.getByText('iCloud Keychain')).toBeOnTheScreen();
    expect(screen.getByText('Added on November 8, 2026')).toBeOnTheScreen();
    expect(screen.getByText('Passkey')).toBeOnTheScreen();
  });

  it('should say when there are none', async () => {
    await open();
    expect(screen.getByText('No passkeys yet.')).toBeOnTheScreen();
  });

  it('should say when the list is out of reach', async () => {
    passkey.list.mockResolvedValueOnce({ data: null, error: offline() });
    await open();
    expect(screen.getByText("This action isn't available offline")).toBeOnTheScreen();
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
    expect(screen.getByText('iCloud Keychain')).toBeOnTheScreen();
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

    expect(screen.getByText(message)).toBeOnTheScreen();
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

    await pressSwift('Delete');
    expect(passkey.delete).not.toHaveBeenCalled();
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('Delete passkey?');
    expect(message).toContain('“iCloud Keychain” will no longer sign you in.');
    expect(buttons.map((b) => b.style)).toEqual(['cancel', 'destructive']);

    await act(async () => buttons[1].onPress?.());

    expect(passkey.delete).toHaveBeenCalledWith({ passkeyId: 'p1' });
    expect(screen.queryByText('iCloud Keychain')).toBeNull();
  });
});
