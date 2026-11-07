import { act, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import RootLayout from '@/app/_layout';
import ShellScreen from '@/app/index';

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

describe('shell', () => {
  it('should switch to German when the device language changes while running', async () => {
    await renderRouter({ _layout: RootLayout, index: ShellScreen });
    expect(await screen.findByText('Plan your outdoor tours')).toBeVisible();

    await act(() => setDeviceLocales([{ languageTag: 'de-AT' }, { languageTag: 'en-US' }]));

    expect(await screen.findByText('Plane deine Touren')).toBeVisible();
  });
});
