import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { connectivity } from '@/core/offline/online';
import { TERMS_VERSION } from '@/features/terms/domain/terms';
import { useTermsStore } from '@/features/terms/presentation/stores/terms-store';

import { resetAuth, signIn } from '../support/auth';
import { fakeAuth } from '../support/fake-supabase';
import { fakeTerms } from '../support/fake-terms';
import { pressSwift, swiftButton } from '../support/swift-ui';
import { routes } from './routes';

// The terms gate in the real route tree (terms-acceptance), on iOS.
const FIRST = /TourenBuddy only stores and shares your plans/;

beforeEach(() => {
  resetAuth();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('terms gate', () => {
  it('should show only the terms to a user who never accepted, then open the app', async () => {
    signIn();
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    await renderRouter(routes, { initialUrl: '/calendar' });

    expect(screen).toHavePathname('/accept-terms');
    expect(screen.getByText(FIRST)).toBeOnTheScreen();
    expect(
      screen.getByText(/personal injury caused by slight or medium negligence/),
    ).toBeOnTheScreen();

    await pressSwift('Accept and continue');

    expect(screen).not.toHavePathname('/accept-terms');
    expect(fakeTerms.status.accepted).toBe(TERMS_VERSION);
  });

  it('should sign out from the page without reaching the app', async () => {
    signIn();
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    await renderRouter(routes);

    await pressSwift('Sign out');

    expect(screen).toHavePathname('/auth');
    expect(fakeAuth.session).toBeNull();
  });

  it('should ask before deleting the account from the page', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    signIn();
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    await renderRouter(routes);

    await pressSwift('Delete account');

    expect(alert).toHaveBeenCalled();
    expect(screen).toHavePathname('/accept-terms');
  });

  it('should send an outdated app to the update, with no way to accept', async () => {
    signIn();
    fakeTerms.status = { current: '2999-01-01', accepted: null };
    await renderRouter(routes);

    expect(screen.getByText(/Please update the app/)).toBeOnTheScreen();
    expect(() => swiftButton('Accept and continue')).toThrow();
    expect(swiftButton('Sign out')).toBeTruthy();
  });

  it('should show the connection note and no working accept button offline, never accepted', async () => {
    signIn();
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    fakeTerms.failure = new Error('Network request failed');
    await renderRouter(routes);

    expect(screen.getByText('To accept, you need a connection.')).toBeOnTheScreen();
  });

  it('should say a connection is needed as soon as the device goes offline, and drop a stale failure once back', async () => {
    signIn();
    fakeTerms.status = { current: TERMS_VERSION, accepted: null };
    await renderRouter(routes);

    await act(async () => connectivity.setState({ online: false }));
    expect(screen.getByText('To accept, you need a connection.')).toBeOnTheScreen();

    await act(async () => useTermsStore.setState({ failed: true }));
    await act(async () => connectivity.setState({ online: true }));
    expect(screen.queryByText('To accept, you need a connection.')).toBeNull();
    expect(screen.queryByText(/couldn’t be saved/)).toBeNull();
  });
});

describe('sign-up', () => {
  it('should link the terms before the account exists', async () => {
    await renderRouter(routes, { initialUrl: '/auth/sign-up' });

    await act(() => fireEvent.press(screen.getByRole('link', { name: 'Terms of Use' })));

    expect(screen).toHavePathname('/auth/legal');
    expect(screen.getByText(/Outdoor activities, especially in the mountains/)).toBeOnTheScreen();
  });
});
