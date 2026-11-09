import { act, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { signIn } from '../support/auth';
import { routes } from './routes';

// Device locales as an external store, so the test can change them the way the OS does.
jest.mock('expo-localization', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  let locales = [{ languageTag: 'en-US' }];
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    getLocales: () => locales,
    useLocales: () => useSyncExternalStore(subscribe, () => locales),
    setDeviceLocales: (next: typeof locales) => {
      locales = next;
      listeners.forEach((l) => l());
    },
  };
});

const { setDeviceLocales } = jest.requireMock('expo-localization');

// The tabs are for a signed-in user (`test/app/auth.test.tsx` covers signing in).
beforeEach(() => signIn());

describe('shell', () => {
  it('should switch to German, tab bar included, when the device language changes while running', async () => {
    await renderRouter(routes);
    expect(await screen.findByText('Plan your outdoor tours')).toBeVisible();

    await act(() => setDeviceLocales([{ languageTag: 'de-AT' }, { languageTag: 'en-US' }]));

    expect(await screen.findByText('Plane deine Touren')).toBeVisible();
    // The tab bar is native: each tab screen hands its label to it as `title`.
    const tabLabels = screen.container
      .queryAll((node) => typeof node.props.screenKey === 'string')
      .map((node) => node.props.title);
    expect(tabLabels).toEqual(['Karte', 'Kalender', 'Kontakte', 'Profil']);
  });
});
