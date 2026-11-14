import { act, fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { signIn } from '../support/auth';
import { routes as appRoutes } from './routes';

// Routing only: Jest's native tab bar keeps every tab mounted and visible, so a plain slot shows
// the active tab alone. The tab bar itself is native UI, checked on devices.
const routes = { ...appRoutes, '(tabs)/_layout': Slot };

beforeEach(() => {
  jest.useFakeTimers();
  signIn();
});
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.runAllTimers());

async function openMap() {
  await fireEvent.press(screen.getByRole('button', { name: 'Map layers' }));
  await settle();
}

describe('app navigation', () => {
  it('should start on the map tab', async () => {
    await renderRouter(routes);

    expect(screen).toHavePathname('/');
    expect(screen.getByTestId('maplibre-Map')).toBeOnTheScreen();
  });

  it('should open the map button as a sheet and close back to the map', async () => {
    await renderRouter(routes);

    await openMap();

    expect(screen).toHavePathname('/map-layers');
    expect(screen.getByRole('heading', { name: 'Map layers' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen).toHavePathname('/');
  });

  it('should reach the offline maps from the map sheet, in its place', async () => {
    await renderRouter(routes);
    await openMap();

    await fireEvent.press(screen.getByRole('button', { name: 'Offline maps' }));
    await settle();

    expect(screen).toHavePathname('/offline-maps');
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();
    expect(screen).toHavePathname('/');
  });

  it('should show the legend inside the map sheet', async () => {
    await renderRouter(routes);
    await openMap();

    await fireEvent.press(screen.getByRole('button', { name: 'Legend' }));
    await settle();

    expect(screen).toHavePathname('/map-layers');
    expect(screen.getByRole('heading', { name: 'Legend' })).toBeOnTheScreen();
  });

  it.each(['/calendar', '/contacts', '/profile'])(
    'should show no map controls on %s',
    async (url) => {
      await renderRouter(routes, { initialUrl: url });

      expect(screen.queryByRole('button', { name: 'Map layers' })).toBeNull();
    },
  );

  it('should put the map beneath a sheet opened from a link', async () => {
    await renderRouter(routes, { initialUrl: '/inbox' });

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen).toHavePathname('/');
    expect(screen.getByTestId('maplibre-Map')).toBeOnTheScreen();
  });
});
