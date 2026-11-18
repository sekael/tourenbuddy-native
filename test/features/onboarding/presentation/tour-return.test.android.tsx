import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/core/i18n';
import { PageReturn } from '@/core/adaptive/page-return';
import { Page, Screen } from '@/core/adaptive/screen';
import {
  useFollowTour,
  useTourOnTab,
  useTourReturn,
  useTourWayBack,
} from '@/features/onboarding/presentation/tour-return';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => true) },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** The root layout's wiring: the tour's way back for the sheet on the current route. */
function Root({ pathname, children }: { pathname: string; children: ReactNode }) {
  return <PageReturn.Provider value={useTourWayBack(pathname)}>{children}</PageReturn.Provider>;
}

const sheet = (pathname = '/map-layers', path: string[] = []) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <Root pathname={pathname}>
      <Screen
        path={path}
        renderPage={() => (
          <Page title="Legend" onClose={() => {}}>
            {null}
          </Page>
        )}
      >
        <Page title="Map layers" onClose={() => {}}>
          {null}
        </Page>
      </Screen>
    </Root>
  </SafeAreaProvider>
);

const touring = (start: 'resume' | 'features') =>
  useTourReturn.setState({ start, dest: '/map-layers', arrived: true });

function Follow({ pathname }: { pathname: string }) {
  useFollowTour(pathname);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  useTourReturn.setState({ start: null, dest: null, arrived: false });
});

describe('the way back to the guided tour in a sheet', () => {
  it('should close every sheet and reopen a sign-in tour with its own controls', async () => {
    touring('resume');
    await render(sheet());

    await fireEvent.press(screen.getByRole('button', { name: 'Back to the app tour' }));

    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome',
      params: { start: 'resume' },
    });
    // Back at the tour, it is no longer under way: the row goes.
    expect(screen.queryByRole('button', { name: 'Back to the app tour' })).toBeNull();
  });

  it('should offer nothing while no tour is under way, and appear once one is', async () => {
    await render(sheet());
    expect(screen.queryByRole('button', { name: 'Back to the app tour' })).toBeNull();

    await act(async () => touring('features'));

    expect(screen.getByRole('button', { name: 'Back to the app tour' })).toBeOnTheScreen();
  });

  it('should not offer it on a sheet the tour did not open (one further on, or on the way)', async () => {
    touring('features');
    await render(sheet('/offline-region'));

    expect(screen.queryByRole('button', { name: 'Back to the app tour' })).toBeNull();
  });

  it('should not offer it on a page pushed inside the destination sheet', async () => {
    touring('features');
    await render(sheet('/map-layers', ['legend']));

    expect(screen.getByText('Legend')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Back to the app tour' })).toBeNull();
  });
});

describe('following the tour across routes', () => {
  it('should keep the tour on the screens on the way, and end it once the user leaves the destination', async () => {
    useTourReturn.setState({ start: 'resume', dest: '/map-layers', arrived: false });
    const view = await render(<Follow pathname="/profile" />); // the welcome sheet closed over Profile
    expect(useTourReturn.getState().start).toBe('resume');

    await view.rerender(<Follow pathname="/map-layers" />);
    expect(useTourReturn.getState().arrived).toBe(true);
    await view.rerender(<Follow pathname="/offline-region" />); // further on: kept, but not shown
    expect(useTourReturn.getState().start).toBe('resume');

    await view.rerender(<Follow pathname="/" />); // the sheet closed: back on the map
    expect(useTourReturn.getState().start).toBeNull();
  });
});

describe('the way back in the tab bar', () => {
  function TabBar({ pathname }: { pathname: string }) {
    return useTourOnTab(pathname) ? <Page title="Back to the app tour">{null}</Page> : null;
  }
  const shown = () => screen.queryByText('Back to the app tour') !== null;

  it('should show it only for a row that opened a tab', async () => {
    useTourReturn.setState({ start: 'features', dest: '/contacts', arrived: false });
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <TabBar pathname="/contacts" />
      </SafeAreaProvider>,
    );

    expect(shown()).toBe(true);
  });

  it('should never show it for a sheet over the map, even before iOS has raised the sheet', async () => {
    // The router is at the sheet's route while the welcome sheet still closes: the map shows.
    useTourReturn.setState({ start: 'features', dest: '/offline-maps', arrived: false });
    await render(<TabBar pathname="/offline-maps" />);

    expect(shown()).toBe(false);
  });
});
