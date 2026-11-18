import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';

import { sessionTrust } from '@/core/auth/session-trust';
import { sessionUser } from '@/core/auth/session-user';
import { connectivity } from '@/core/offline/online';
import { supabase } from '@/core/supabase';
import {
  setAppBadge,
  useNotificationsStore,
} from '@/features/notifications/presentation/stores/notifications-store';

jest.mock('expo-application', () => ({
  applicationId: 'ch.tourenbuddy.app',
  nativeApplicationVersion: '1.2.0',
  ApplicationReleaseType: { UNKNOWN: 0, SIMULATOR: 1, DEVELOPMENT: 3, APP_STORE: 5 },
  getIosPushNotificationServiceEnvironmentAsync: jest.fn(),
  getIosApplicationReleaseTypeAsync: jest.fn(),
}));

const rpc = jest.fn(async (..._: unknown[]) => ({ error: null as { message: string } | null }));
const profileEnv = jest.mocked(Application.getIosPushNotificationServiceEnvironmentAsync);
const release = jest.mocked(Application.getIosApplicationReleaseTypeAsync);

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(supabase, { rpc });
  sessionUser.setState({ id: 'u1' });
  sessionTrust.setState({ unverified: false });
  connectivity.setState({ online: true });
  useNotificationsStore.setState({ pushEnabled: false });
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
});

const environment = () => (rpc.mock.calls.at(-1)?.[1] as { p_apns_environment: string })
  .p_apns_environment;

describe('turning push on (iOS)', () => {
  it("should register the Simulator's token for the APNs sandbox, though it has no profile", async () => {
    profileEnv.mockResolvedValue(null);
    release.mockResolvedValue(Application.ApplicationReleaseType.SIMULATOR);

    await useNotificationsStore.getState().setPushEnabled(true);

    expect(environment()).toBe('development');
    expect(useNotificationsStore.getState().pushEnabled).toBe(true);
  });

  it('should register an App Store or TestFlight token for production (Apple strips the profile)', async () => {
    profileEnv.mockResolvedValue(null);
    release.mockResolvedValue(Application.ApplicationReleaseType.APP_STORE);

    await useNotificationsStore.getState().setPushEnabled(true);

    expect(environment()).toBe('production');
  });

  it('should leave push off and fail when the backend refuses the token', async () => {
    profileEnv.mockResolvedValue('development');
    rpc.mockResolvedValueOnce({ error: { message: 'schema cache' } });

    await expect(useNotificationsStore.getState().setPushEnabled(true)).rejects.toThrow();

    expect(useNotificationsStore.getState().pushEnabled).toBe(false);
  });
});

describe('app icon badge', () => {
  it('should clear the badge on sign-out, so a signed-out phone counts nothing', () => {
    useNotificationsStore.getState().clear();

    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
  });

  it('should not throw when iOS refuses the badge (notifications not allowed)', async () => {
    jest.mocked(Notifications.setBadgeCountAsync).mockRejectedValueOnce(new Error('not allowed'));

    expect(() => setAppBadge(3)).not.toThrow();
    await Promise.resolve();
  });
});
