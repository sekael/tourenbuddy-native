import { act, fireEvent, render, screen } from '@testing-library/react';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/core/i18n';
import { EmailEntryScreen } from '@/features/auth/presentation/email-entry-screen';
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
    show(<EmailEntryScreen />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('TourenBuddy');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Enter your email');
  });

  it('should mark the email field for autofill and send on Enter', async () => {
    show(<EmailEntryScreen />);
    const field = screen.getByLabelText('Email address');

    expect(field.getAttribute('autocomplete')).toBe('email');
    expect(field.getAttribute('type')).toBe('email');

    fireEvent.change(field, { target: { value: 'anna@example.com' } });
    await act(async () => fireEvent.keyDown(field, { key: 'Enter' }));

    expect(supabase.auth.signInWithOtp).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/auth/verify-otp',
      params: { email: 'anna@example.com' },
    });
  });

  it('should mark the code field as a one-time code on a numeric keypad, without a name', () => {
    show(<VerifyOtpScreen email="anna@example.com" />);
    const field = screen.getByLabelText('Sign-in code');

    expect(field.getAttribute('autocomplete')).toBe('one-time-code');
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.hasAttribute('name')).toBe(false);
  });
});
