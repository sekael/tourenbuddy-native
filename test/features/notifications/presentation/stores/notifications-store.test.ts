import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';

import { sessionTrust } from '@/core/auth/session-trust';
import { sessionUser } from '@/core/auth/session-user';
import { connectivity } from '@/core/offline/online';
import { supabase } from '@/core/supabase';
import {
  forgetSignedOutDevice,
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

const environment = () =>
  (rpc.mock.calls.at(-1)?.[1] as { p_apns_environment: string }).p_apns_environment;

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

  it('should give up and say so when the system never hands out a token (no silent switch)', async () => {
    jest.useFakeTimers();
    profileEnv.mockResolvedValue('development');
    jest.mocked(Notifications.getDevicePushTokenAsync).mockReturnValueOnce(new Promise(() => {}));

    const turningOn = useNotificationsStore.getState().setPushEnabled(true);
    const failed = expect(turningOn).rejects.toThrow('no push token');
    await jest.advanceTimersByTimeAsync(15_000);
    await failed;
    jest.useRealTimers();

    expect(useNotificationsStore.getState()).toMatchObject({
      pushEnabled: false,
      pushPending: false,
    });
  });

  it('should switch on after permission was granted in Settings, once denied at the prompt', async () => {
    profileEnv.mockResolvedValue('development');
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ status: 'undetermined' } as never);
    await useNotificationsStore.getState().setPushEnabled(true); // the prompt answers «Nicht erlauben»
    expect(useNotificationsStore.getState()).toMatchObject({
      pushEnabled: false,
      permission: 'denied',
    });

    // Allowed in Settings: the next try reads the new permission and registers.
    await useNotificationsStore.getState().setPushEnabled(true);

    expect(useNotificationsStore.getState()).toMatchObject({
      pushEnabled: true,
      permission: 'granted',
    });
  });
});

describe('signed out', () => {
  it('should unregister a token whose row sign-out could not delete, so its pushes stop', async () => {
    profileEnv.mockResolvedValue('development');
    await useNotificationsStore.getState().setPushEnabled(true); // caches this device's token

    await forgetSignedOutDevice();
    await forgetSignedOutDevice();

    expect(Notifications.unregisterForNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.setBadgeCountAsync).toHaveBeenLastCalledWith(0);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalled();
  });

  it('should keep the badge at zero and leave APNs alone when nothing was registered', async () => {
    await forgetSignedOutDevice();

    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
    expect(Notifications.unregisterForNotificationsAsync).not.toHaveBeenCalled();
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
