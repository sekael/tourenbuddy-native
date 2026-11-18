import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { PageReturn } from '@/core/adaptive/page-return';
import { TourReturn } from '@/features/onboarding/presentation/tour-return';
import type { UserProfile } from '@/features/user/domain/entities/user-profile';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { signIn } from '../support/auth';
import { routes as appRoutes } from './routes';

// The tab bar's accessory (the way back to the tour) beside the tabs' content, which leave the
// sheets' way back out, as on iOS.
const routes = {
  ...appRoutes,
  '(tabs)/_layout': () => (
    <PageReturn.Provider value={null}>
      <Slot />
      <TourReturn />
    </PageReturn.Provider>
  ),
};

const newAccount = {
  id: 'user-1',
  firstName: null,
  lastName: null,
  // The app's language already: no language write to tell apart from the name's.
  locale: 'en',
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
    await fireEvent.press(button('Later'));
    await settle();
    expect(screen.getByText('Plan a tour')).toBeOnTheScreen();
    // The overview is the sheet's first page now: no way back to a name step already passed.
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(screen.queryByText('Set up your profile')).toBeNull();
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

    // The way back ends with its close button; the place stays.
    await fireEvent.press(button('Finish tour'));
    expect(screen.queryByRole('button', { name: 'Back to the app tour' })).toBeNull();
    expect(screen).toHavePathname('/contacts');
  });

  it('should lead back to a sign-in tour with its Done, without asking for the name again', async () => {
    await renderRouter(routes, { initialUrl: '/welcome' });
    await settle(); // the profile store's own load (which fails here) comes first
    await act(async () => useUserProfileStore.setState({ profile: newAccount, ...actions }));
    await settle();
    await fireEvent.press(button('Later')); // the name
    await settle();
    await fireEvent.press(screen.getByText('Friend requests'));
    await settle();
    expect(screen).toHavePathname('/contacts');

    await fireEvent.press(button('Back to the app tour'));
    await settle();

    expect(screen).toHavePathname('/welcome');
    expect(screen.queryByText('Set up your profile')).toBeNull();
    await fireEvent.press(button('Done'));
    await settle();
    expect(actions.dismissTourAtSignIn).toHaveBeenCalledTimes(1);
    // Closed without picking a place, the tour is over.
    expect(screen.queryByRole('button', { name: 'Back to the app tour' })).toBeNull();
  });
});
