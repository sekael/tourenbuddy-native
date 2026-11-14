import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import type { UserProfile } from '@/features/user/domain/entities/user-profile';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { signIn } from '../support/auth';
import { routes as appRoutes } from './routes';

const routes = { ...appRoutes, '(tabs)/_layout': Slot };

const newAccount = {
  id: 'user-1',
  firstName: null,
  lastName: null,
  locale: null,
  onboardingTourShowAtSignIn: true,
  onboardingTourLastStep: 0,
  calendarTourShowOnFirstOpen: true,
  calendarFeatureNoticeShowAtSignIn: false,
  pace: 1,
  updatedAt: null,
} as UserProfile;

const actions = {
  updateProfile: jest.fn(async () => undefined),
  dismissTourAtSignIn: jest.fn(async () => {}),
};

beforeEach(() => {
  jest.useFakeTimers();
  signIn();
  actions.updateProfile.mockClear();
  actions.dismissTourAtSignIn.mockClear();
});
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.runAllTimers());
const button = (name: string) => screen.getByRole('button', { name });

// The gate shows the sheet once per launch (a module flag), so the cases build on each other.
describe('welcome (onboarding)', () => {
  it('should ask a new account for its name, insisting on both names', async () => {
    await renderRouter(routes);
    await settle(); // the profile store's own load (which fails here) comes first
    await act(async () => useUserProfileStore.setState({ profile: newAccount, ...actions }));
    await settle();

    expect(screen).toHavePathname('/welcome');
    expect(screen.getByText('Set up your profile')).toBeOnTheScreen();

    await fireEvent.press(button('Continue'));
    expect(screen.getByText('First name is required')).toBeOnTheScreen();
    expect(actions.updateProfile).not.toHaveBeenCalled();

    // Skipping the name still shows what the app does; Done stops it showing at sign-in.
    await fireEvent.press(button('Skip for now'));
    await settle();
    expect(screen.getByText('Plan a tour')).toBeOnTheScreen();
    await fireEvent.press(button('Done'));
    await settle();
    expect(actions.dismissTourAtSignIn).toHaveBeenCalledTimes(1);
  });

  it('should open what the app does when reopened, without the name step or the gate', async () => {
    await renderRouter(routes, { initialUrl: '/welcome?start=features' });
    await settle(); // the profile store's own load (which fails here) comes first
    await act(async () => useUserProfileStore.setState({ profile: newAccount, ...actions }));
    await settle();

    expect(screen.queryByText('Set up your profile')).toBeNull();
    expect(screen.getByText('Plan a tour')).toBeOnTheScreen();

    // Reopened, it only closes: the sign-in gate stays as it is.
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    await fireEvent.press(button('Close'));
    await settle();
    expect(actions.dismissTourAtSignIn).not.toHaveBeenCalled();
  });

  it('should take a row to its place', async () => {
    await renderRouter(routes, { initialUrl: '/welcome?start=features' });
    await settle(); // the profile store's own load (which fails here) comes first
    await act(async () => useUserProfileStore.setState({ profile: newAccount, ...actions }));
    await settle();

    await fireEvent.press(screen.getByText('Friend requests'));
    await settle();

    expect(screen).toHavePathname('/contacts');
    expect(actions.dismissTourAtSignIn).not.toHaveBeenCalled();
  });
});
