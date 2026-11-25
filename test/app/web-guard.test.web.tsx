import { act, render, screen } from '@testing-library/react';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';

import WebRootLayout from '@/app/_layout';
import NotFound from '@/app/+not-found';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { resetAuth, signIn } from '../support/auth';

// Side-effect imports of the layout that only matter in a browser.
jest.mock('@/core/theme/load-fonts', () => ({}));

// The pages themselves are covered elsewhere: here only where the root layout lands. The DOM
// Testing Library, since the web layout renders DOM (`renderRouter` is React Native's).
const page = (name: string) =>
  function Page() {
    return <p>{name}</p>;
  };
const context = getMockContext({
  _layout: WebRootLayout,
  index: page('sign-in'),
  map: page('map'),
  'accept-terms': page('terms'),
  onboarding: page('onboarding'),
  '+not-found': NotFound,
});

/** Shown, not merely mounted: the layout hides the page it is redirecting away from. */
const shown = async (text: string) =>
  !(await screen.findByText(text)).closest('[style*="display: none"]');

/** A cold start of the web app at `url`. */
async function open(url: string) {
  window.history.replaceState(null, '', url);
  render(<ExpoRoot context={context} location={url} />);
  await act(async () => {});
}

beforeEach(() =>
  useUserProfileStore.setState({
    profile: { firstName: 'Anna', lastName: 'Muster' } as never,
    isLoading: false,
  }),
);

describe('web routes on a cold start', () => {
  it('should land a signed-in user who opens / (the installed app) on the map, not a blank page', async () => {
    signIn();

    await open('/');

    expect(await shown('map')).toBe(true);
    expect(window.location.pathname).toBe('/map');
  });

  it('should send an address the PWA never had to the map, without the router error page', async () => {
    signIn();

    await open('/no-such-page');

    expect(await shown('map')).toBe(true);
    expect(screen.queryByText('Unmatched Route')).toBeNull();
  });

  it('should send a signed-out visitor of an unknown address to sign-in', async () => {
    resetAuth();

    await open('/no-such-page');

    expect(await shown('sign-in')).toBe(true);
    expect(window.location.pathname).toBe('/');
  });
});
