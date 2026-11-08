import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { resetAuth, signIn } from '../support/auth';
import { fakeAuth, supabase, testSession } from '../support/fake-supabase';
import { pressSwift } from '../support/swift-ui';
import { routes } from './routes';

// Sign-in and the routes following the session, on iOS (SwiftUI buttons, see support/swift-ui).
const press = pressSwift;

async function type(label: string, text: string) {
  await act(() => fireEvent.changeText(screen.getByLabelText(label), text));
}

async function signInWithCode() {
  await type('Email address', 'anna@example.com');
  await press('Send Code');
  await type('Sign-in code', '123456');
}

// The launch screen, as the root layout reaches it through `SplashScreen` from expo-router.
jest.mock('expo-router/build/utils/splash', () => ({
  ...jest.requireActual('expo-router/build/utils/splash'),
  hide: jest.fn(),
}));
const splash = jest.requireMock<{ hide: jest.Mock }>('expo-router/build/utils/splash');

beforeEach(() => {
  resetAuth();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('signed out', () => {
  it('should show the email screen at launch, without the tabs', async () => {
    await renderRouter(routes);

    expect(screen).toHavePathname('/auth');
    expect(screen.getByRole('heading', { name: 'TourenBuddy' })).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'Enter your email' })).toBeOnTheScreen();
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it.each(['/calendar', '/inbox'])(
    'should answer a link to %s with sign-in, and open the map after signing in',
    async (url) => {
      await renderRouter(routes, { initialUrl: url });
      expect(screen).toHavePathname('/auth');

      await signInWithCode();

      expect(screen).toHavePathname('/');
    },
  );

  it('should sign in with the code and leave no way back to sign-in', async () => {
    await renderRouter(routes);

    await type('Email address', '  anna@example.com ');
    await press('Send Code');

    expect(screen).toHavePathname('/auth/verify-otp');
    expect(screen.getByText('anna@example.com')).toBeOnTheScreen();
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'anna@example.com' }),
    );

    await type('Sign-in code', '123456');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'anna@example.com',
      token: '123456',
      type: 'email',
    });
    expect(screen).toHavePathname('/');
    expect(router.canGoBack()).toBe(false);
  });

  it('should go back to the email screen with the address as typed', async () => {
    await renderRouter(routes);
    await type('Email address', 'anna@example.com');
    await press('Send Code');

    await act(() => router.back());

    expect(screen).toHavePathname('/auth');
    expect(screen.getByLabelText('Email address')).toHaveDisplayValue('anna@example.com');
  });

  it('should send a code screen without an email back to the email screen', async () => {
    await renderRouter(routes, { initialUrl: '/auth/verify-otp' });
    expect(screen).toHavePathname('/auth');
  });
});

describe('signed in', () => {
  beforeEach(() => signIn());

  it('should open the map, not sign-in, at the sign-in address', async () => {
    await renderRouter(routes, { initialUrl: '/auth' });

    expect(screen).toHavePathname('/');
    expect(screen.queryByRole('heading', { name: 'Enter your email' })).toBeNull();
  });

  it('should keep the address the app was opened at', async () => {
    await renderRouter(routes, { initialUrl: '/inbox' });
    expect(screen).toHavePathname('/inbox');
  });

  it('should keep the launch screen until the session is known', async () => {
    let settle!: () => void;
    supabase.auth.getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = () => resolve({ data: { session: fakeAuth.session }, error: null });
      }) as never,
    );
    splash.hide.mockClear();

    await renderRouter(routes);
    expect(splash.hide).not.toHaveBeenCalled();

    await act(async () => settle());

    expect(splash.hide).toHaveBeenCalled();
    expect(screen).toHavePathname('/');
  });

  it('should sign out from the Profile tab', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });
    expect(screen.getByText('anna@example.com')).toBeOnTheScreen();

    await press('Sign out');

    expect(screen).toHavePathname('/auth');
    expect(router.canGoBack()).toBe(false);
  });

  it('should leave a sheet for sign-in when the server ends the session', async () => {
    await renderRouter(routes, { initialUrl: '/inbox' });

    await act(async () => fakeAuth.emit('SIGNED_OUT', null));

    expect(screen).toHavePathname('/auth');
    expect(router.canGoBack()).toBe(false);
  });

  it('should stay on the current screen when a refresh delivers the session again', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });

    await act(async () => fakeAuth.emit('TOKEN_REFRESHED', testSession()));

    expect(screen).toHavePathname('/calendar');
  });
});

describe('offline', () => {
  it('should open the map on the stored session and say so on the Profile tab', async () => {
    signIn();
    const stored = fakeAuth.session;
    fakeAuth.session = null;
    const { memory } = jest.requireMock('@/core/auth/auth-storage');
    memory.set('sb-127-auth-token', JSON.stringify(stored));
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    } as never);

    await renderRouter(routes, { initialUrl: '/profile' });

    expect(screen).toHavePathname('/profile');
    expect(screen.getByText('Signed in offline · data may be out of date')).toBeOnTheScreen();

    await act(async () => fakeAuth.emit('TOKEN_REFRESHED', testSession()));
    expect(screen.queryByText('Signed in offline · data may be out of date')).toBeNull();
  });

  it('should not sign in with a session the server revoked', async () => {
    signIn();
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    } as never);

    await renderRouter(routes, { initialUrl: '/calendar' });

    expect(screen).toHavePathname('/auth');
  });
});
