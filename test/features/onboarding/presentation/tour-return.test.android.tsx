import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/core/i18n';
import { PageReturn } from '@/core/adaptive/page-return';
import { Page, Screen } from '@/core/adaptive/screen';
import { useTourReturn, useTourWayBack } from '@/features/onboarding/presentation/tour-return';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), dismissAll: jest.fn(), canDismiss: jest.fn(() => true) },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** The root layout's wiring: the tour's way back for every sheet's page. */
function Root({ children }: { children: ReactNode }) {
  return <PageReturn.Provider value={useTourWayBack()}>{children}</PageReturn.Provider>;
}

const sheet = (
  <SafeAreaProvider initialMetrics={metrics}>
    <Root>
      <Screen>
        <Page title="Map layers" onClose={() => {}}>
          {null}
        </Page>
      </Screen>
    </Root>
  </SafeAreaProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  useTourReturn.setState({ start: null });
});

describe('the way back to the guided tour in a sheet', () => {
  it('should close every sheet and reopen a sign-in tour with its own controls', async () => {
    useTourReturn.setState({ start: 'resume' });
    await render(sheet);

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
    await render(sheet);
    expect(screen.queryByRole('button', { name: 'Back to the app tour' })).toBeNull();

    await act(async () => useTourReturn.setState({ start: 'features' }));

    expect(screen.getByRole('button', { name: 'Back to the app tour' })).toBeOnTheScreen();
  });
});
