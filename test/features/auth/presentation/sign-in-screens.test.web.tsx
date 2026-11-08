import { act, fireEvent, render, screen } from '@testing-library/react';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/core/i18n';
import { SignInScreen } from '@/features/auth/presentation/sign-in-screen';
import { SignUpScreen } from '@/features/auth/presentation/sign-up-screen';
import { VerifyOtpScreen } from '@/features/auth/presentation/verify-otp-screen';

import { resetAuth } from '../../../support/auth';
import { supabase } from '../../../support/fake-supabase';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const show = (screen: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{screen}</SafeAreaProvider>);

// Web: the browser's autofill reads the DOM attributes, and screen readers the heading levels.
beforeEach(() => resetAuth());

describe('sign-in screens (web)', () => {
  it('should have one top-level heading, the product name', async () => {
    show(<SignInScreen />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('TourenBuddy');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Sign in');
  });

  it('should mark the sign-in form for password managers and sign in on Enter', async () => {
    show(<SignInScreen />);
    const email = screen.getByLabelText('Email address');
    const password = screen.getByLabelText('Password');

    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(email.getAttribute('type')).toBe('email');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(password.getAttribute('type')).toBe('password');

    fireEvent.change(email, { target: { value: 'anna@example.com' } });
    fireEvent.change(password, { target: { value: 'secret-123' } });
    await act(async () => fireEvent.keyDown(password, { key: 'Enter' }));

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.com',
      password: 'secret-123',
    });
  });

  it('should send a code from its button, and offer no passkey', async () => {
    show(<SignInScreen />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'anna@example.com' },
    });

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Email me a code' })));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/auth/verify-otp',
      params: { email: 'anna@example.com' },
    });
    expect(screen.queryByRole('button', { name: 'Sign in with passkey' })).toBeNull();
  });

  it('should mark the new password for password managers', () => {
    show(<SignUpScreen />);
    const password = screen.getByLabelText('New password');

    expect(screen.getByLabelText('Email address').getAttribute('autocomplete')).toBe('username');
    expect(password.getAttribute('autocomplete')).toBe('new-password');
    expect(password.getAttribute('type')).toBe('password');
  });

  it('should mark the code field as a one-time code on a numeric keypad, without a name', () => {
    show(<VerifyOtpScreen email="anna@example.com" />);
    const field = screen.getByLabelText('Sign-in code');

    expect(field.getAttribute('autocomplete')).toBe('one-time-code');
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.hasAttribute('name')).toBe(false);
  });
});
