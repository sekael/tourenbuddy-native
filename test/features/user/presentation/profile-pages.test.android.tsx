import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { sessionTrust } from '@/core/auth/session-trust';
import { env } from '@/core/env';
import '@/core/i18n';
import { connectivity } from '@/core/offline/online';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';
import { NotificationSettingsPage } from '@/features/notifications/presentation/notification-settings-page';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';
import { ProfilePage } from '@/features/user/presentation/profile-pages';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const deleteAccount = jest.fn<Promise<boolean>, []>();
const signOut = jest.fn(async () => {});
let alert: jest.SpyInstance;

/** The buttons of the alert titled `title`, the last one shown. */
const buttons = (title: string) =>
  (alert.mock.calls.filter((c) => c[0] === title).at(-1)?.[2] ?? []) as AlertButton[];

beforeEach(() => {
  jest.clearAllMocks();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  connectivity.setState({ online: true });
  sessionTrust.setState({ unverified: false });
  env.EXPO_PUBLIC_NOTIFY_HOOK_URL = 'https://worker.example';
  useAuthStore.setState({ user: { id: 'u1', email: 'anna@example.com' } as never, signOut });
  useUserProfileStore.setState({ profile: null, deleteAccount });
  useNotificationsStore.setState({ removeThisDevice: jest.fn(async () => {}) });
  useCalendarFeedStore.setState({ feeds: [], loadFeeds: jest.fn(async () => {}) });
});

describe('ProfilePage: deleting the account', () => {
  async function confirmDelete() {
    await render(<ProfilePage onPush={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
    await buttons('Delete your account?')
      .find((b) => b.style === 'destructive')!
      .onPress!();
  }

  it('should ask to connect first when offline, deleting nothing', async () => {
    connectivity.setState({ online: false });
    await render(<ProfilePage onPush={() => {}} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));

    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/offline/));
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('should say where to ask when this build has no way to delete', async () => {
    env.EXPO_PUBLIC_NOTIFY_HOOK_URL = undefined;
    await render(<ProfilePage onPush={() => {}} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));

    expect(alert).toHaveBeenCalledWith(expect.stringMatching(/feedback@tourenbuddy\.ch/));
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('should stay signed in after a failure and try again on request', async () => {
    deleteAccount.mockResolvedValue(false);
    await confirmDelete();

    await waitFor(() => expect(buttons('Your account could not be deleted. Please try again.')).not.toEqual([]));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeOnTheScreen();
    deleteAccount.mockResolvedValue(true);
    await buttons('Your account could not be deleted. Please try again.')
      .find((b) => b.text === 'Try again')!
      .onPress!();
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(deleteAccount).toHaveBeenCalledTimes(2);
  });

  it('should sign out and say so once the account is gone', async () => {
    deleteAccount.mockResolvedValue(true);
    await confirmDelete();

    await waitFor(() =>
      expect(alert).toHaveBeenLastCalledWith(expect.stringMatching(/account is deleted/)),
    );
    expect(signOut).toHaveBeenCalled();
  });
});

describe('NotificationSettingsPage', () => {
  it('should show the kinds off and waiting while push and email are both off', async () => {
    useNotificationsStore.setState({
      pushEnabled: false,
      permission: 'granted',
      prefs: { notifEmailEnabled: false, notifMutedTypes: [] } as never,
    });
    await render(<NotificationSettingsPage />);

    const kind = screen.getByLabelText('Friend requests');
    expect(kind).toBeDisabled();
    expect(kind.props.on).toBe(false);
  });
});
