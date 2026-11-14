import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { redirectSystemPath } from '@/app/+native-intent';
import type { UserProfile } from '@/features/user/domain/entities/user-profile';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { resetAuth } from '../support/auth';
import { fakeAuth, testSession } from '../support/fake-supabase';
import { routes as appRoutes } from './routes';

const routes = { ...appRoutes, '(tabs)/_layout': Slot };

const newAccount = {
  id: 'user-1',
  firstName: null,
  lastName: null,
  onboardingTourShowAtSignIn: true,
  calendarTourShowOnFirstOpen: true,
  pace: 1,
} as UserProfile;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.runAllTimers());

// Its own file: the welcome gate shows once per launch (a module flag).
describe('a link and the welcome sheet together', () => {
  it('should show the welcome sheet over the held link, and the link once it closes', async () => {
    resetAuth();
    const path = redirectSystemPath({ path: 'https://tourenbuddy.ch/inbox', initial: true });
    await renderRouter(routes, { initialUrl: path });
    await settle();

    await act(async () => fakeAuth.emit('SIGNED_IN', testSession()));
    await settle(); // the profile store's own load (which fails here) comes first
    await act(async () =>
      useUserProfileStore.setState({
        profile: newAccount,
        updateProfile: jest.fn(async () => undefined),
        dismissTourAtSignIn: jest.fn(async () => {}),
      }),
    );
    await settle();
    // The link opened at sign-in; the new account's welcome sheet covers it.
    expect(screen).toHavePathname('/welcome');

    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    await settle();

    expect(screen).toHavePathname('/inbox');
  });
});
