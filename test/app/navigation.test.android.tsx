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

  it('should open a menu destination as a sheet and close back to the same tab', async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });

    await openFromMenu('Inbox');

    expect(screen).toHavePathname('/inbox');
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen).toHavePathname('/calendar');
  });

  it.each([
    ['Inbox', '/inbox'],
    ['Contacts', '/contacts'],
    ['Profile', '/profile'],
    ['Offline maps', '/offline-maps'],
    ['Map layers', '/map-layers'],
    ['Feedback', '/feedback'],
  ])('should route the %s menu item to %s', async (item, path) => {
    await renderRouter(routes);

    await openFromMenu(item);

    expect(screen).toHavePathname(path);
  });

  it("should leave the map's own entries out of the menu on the calendar", async () => {
    await renderRouter(routes, { initialUrl: '/calendar' });

    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    await settle();

    expect(screen.getByRole('button', { name: 'Inbox' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Offline maps' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Map layers' })).toBeNull();
  });

  it('should fold the menu away when a sheet opens over its tab', async () => {
    await renderRouter(routes);
    await fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    await settle();

    await act(() => router.push('/inbox'));
    await settle();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen.queryByRole('button', { name: 'Inbox' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeCollapsed();
  });

  it('should put the map beneath a sheet opened from a link', async () => {
    await renderRouter(routes, { initialUrl: '/profile' });

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await settle();

    expect(screen).toHavePathname('/');
    expect(screen.getByText('Plan your outdoor tours')).toBeOnTheScreen();
  });
});
