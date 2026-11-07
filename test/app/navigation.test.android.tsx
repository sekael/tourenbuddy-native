import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { routes as appRoutes } from './routes';

// Routing only: Jest's native tab bar keeps every tab mounted and visible, so a plain slot shows
// the active tab alone. The tab bar itself is native UI, checked on devices.
const routes = { ...appRoutes, '(tabs)/_layout': Slot };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const settle = () => act(() => jest.runAllTimers());

async function openFromMenu(item: string) {
  await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
  await settle();
  await fireEvent.press(screen.getByRole('button', { name: item }));
  await settle();
}

describe('app navigation', () => {
  it('should start on the map tab', async () => {
    await renderRouter(routes);

    expect(screen).toHavePathname('/');
    expect(screen.getByText('Plan your outdoor tours')).toBeOnTheScreen();
  });

  it('should open a menu destination as a sheet and close back to the map', async () => {
    await renderRouter(routes);

    await openFromMenu('Map layers');

    expect(screen).toHavePathname('/map-layers');
    expect(screen.getByRole('heading', { name: 'Map layers' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen).toHavePathname('/');
  });

  it.each([
    ['Offline maps', '/offline-maps'],
    ['Map layers', '/map-layers'],
  ])('should route the %s menu item to %s', async (item, path) => {
    await renderRouter(routes);

    await openFromMenu(item);

    expect(screen).toHavePathname(path);
  });

  it.each(['/calendar', '/contacts', '/profile'])('should show no menu on %s', async (url) => {
    await renderRouter(routes, { initialUrl: url });

    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
  });

  it('should fold the menu away when a sheet opens over its tab', async () => {
    await renderRouter(routes);
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    await settle();

    await act(() => router.push('/inbox'));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen.queryByRole('button', { name: 'Map layers' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeCollapsed();
  });

  it('should put the map beneath a sheet opened from a link', async () => {
    await renderRouter(routes, { initialUrl: '/inbox' });

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen).toHavePathname('/');
    expect(screen.getByText('Plan your outdoor tours')).toBeOnTheScreen();
  });
});
