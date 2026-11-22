import { act, waitFor } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import { redirectSystemPath } from '@/app/+native-intent';

import { resetAuth, signIn } from '../support/auth';
import { fakeAuth, testSession } from '../support/fake-supabase';
import { routes } from './routes';

jest.mock('@/features/notifications/presentation/inbox-navigation', () => ({
  ...jest.requireActual('@/features/notifications/presentation/inbox-navigation'),
  openNotificationLink: jest.fn(async () => {}),
}));
const { openNotificationLink } = jest.requireMock<{ openNotificationLink: jest.Mock }>(
  '@/features/notifications/presentation/inbox-navigation',
);

beforeEach(() => openNotificationLink.mockClear());

describe('notification links', () => {
  it('should open a link that arrived signed out once the user signs in', async () => {
    resetAuth();
    const path = redirectSystemPath({
      path: 'https://tourenbuddy.ch/?notification=n-42',
      initial: true,
    });
    await renderRouter(routes, { initialUrl: path });
    expect(openNotificationLink).not.toHaveBeenCalled();

    await act(async () => fakeAuth.emit('SIGNED_IN', testSession()));

    await waitFor(() => expect(openNotificationLink).toHaveBeenCalledTimes(1));
    expect(openNotificationLink.mock.calls[0]![0]).toBe('n-42');
  });

  it('should open a link once when signed in, not again on the next render', async () => {
    signIn();
    const path = redirectSystemPath({
      path: 'tourenbuddy://?notification=n-7',
      initial: true,
    });
    await renderRouter(routes, { initialUrl: path });

    await waitFor(() => expect(openNotificationLink).toHaveBeenCalledTimes(1));
    expect(openNotificationLink.mock.calls[0]![0]).toBe('n-7');
  });

  it('should follow an app link that arrived signed out once the user signs in', async () => {
    resetAuth();
    const path = redirectSystemPath({ path: 'https://tourenbuddy.ch/inbox', initial: true });
    await renderRouter(routes, { initialUrl: path });
    expect(screen).toHavePathname('/auth');

    await act(async () => fakeAuth.emit('SIGNED_IN', testSession()));

    await waitFor(() => expect(screen).toHavePathname('/inbox'));
    expect(openNotificationLink).not.toHaveBeenCalled();
  });
});
