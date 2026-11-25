import { env } from '@/core/env';
import { sessionUser } from '@/core/auth/session-user';
import { connectivity } from '@/core/offline/online';
import { supabase } from '@/core/supabase';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';
import { webPush } from '@/features/notifications/presentation/stores/web-push';

const rpc = jest.fn(async (..._: unknown[]) => ({ error: null as { message: string } | null }));
const eq = jest.fn(async (..._: unknown[]) => ({ error: null as { message: string } | null }));
const from = jest.fn(() => ({ delete: () => ({ eq }) }));

const browserUnsubscribe = jest.fn(async () => true);
const subscription = {
  endpoint: 'https://push.example/abc',
  toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: browserUnsubscribe,
};
const pushManager = { getSubscription: jest.fn(), subscribe: jest.fn() };
const requestPermission = jest.fn();

/** A browser with push: permission as given, and an existing subscription or none. */
function browser(permission: NotificationPermission, existing: typeof subscription | null) {
  Object.assign(window, {
    PushManager: function PushManager() {},
    Notification: { permission, requestPermission },
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  pushManager.getSubscription.mockResolvedValue(existing);
  pushManager.subscribe.mockResolvedValue(subscription);
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(supabase, { rpc, from });
  Object.assign(env, {
    EXPO_PUBLIC_VAPID_PUBLIC_KEY: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFg',
  });
  sessionUser.setState({ id: 'u1' });
  connectivity.setState({ online: true });
  useNotificationsStore.setState({ pushEnabled: false, pushPending: false });
});

describe('web push, turning it on', () => {
  it('should stay off and register nothing when the prompt is refused', async () => {
    browser('default', null);
    requestPermission.mockResolvedValue('denied');

    await useNotificationsStore.getState().setPushEnabled(true);

    expect(rpc).not.toHaveBeenCalled();
    expect(useNotificationsStore.getState()).toMatchObject({
      pushEnabled: false,
      pushPending: false,
    });
  });

  it("should reuse the browser's subscription rather than make a second one", async () => {
    browser('granted', subscription);
    requestPermission.mockResolvedValue('granted');

    await expect(webPush.subscribe()).resolves.toBe(true);

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      'register_push_subscription',
      expect.objectContaining({ p_endpoint: subscription.endpoint }),
    );
  });

  it('should leave the switch off, not throw, when the backend refuses the row', async () => {
    browser('default', null);
    requestPermission.mockResolvedValue('granted');
    rpc.mockResolvedValueOnce({ error: { message: 'schema cache' } });

    await useNotificationsStore.getState().setPushEnabled(true);

    expect(useNotificationsStore.getState()).toMatchObject({
      pushEnabled: false,
      pushPending: false,
    });
  });

  it('should not ask the browser at all without a VAPID key (push unconfigured)', async () => {
    browser('default', null);
    Object.assign(env, { EXPO_PUBLIC_VAPID_PUBLIC_KEY: undefined });

    await expect(webPush.subscribe()).resolves.toBe(false);

    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('should do nothing offline (the toggle is never queued)', async () => {
    browser('default', null);
    connectivity.setState({ online: false });

    await useNotificationsStore.getState().setPushEnabled(true);

    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe('web push, this device', () => {
  it('should still drop the browser subscription when its row cannot be deleted', async () => {
    browser('granted', subscription);
    eq.mockResolvedValueOnce({ error: { message: 'offline' } });

    await webPush.unsubscribe();

    expect(browserUnsubscribe).toHaveBeenCalled();
  });

  it('should report push off at start when permission was revoked, without touching the worker', async () => {
    browser('denied', subscription);
    useNotificationsStore.setState({ pushEnabled: true });

    await useNotificationsStore.getState().ensurePushToken();

    expect(pushManager.getSubscription).not.toHaveBeenCalled();
    expect(useNotificationsStore.getState()).toMatchObject({
      pushEnabled: false,
      permission: 'denied',
    });
  });

  it('should not let sign-out hang on a stalled unsubscribe', async () => {
    jest.useFakeTimers();
    browser('granted', subscription);
    eq.mockReturnValueOnce(new Promise(() => {}));
    useNotificationsStore.setState({ pushEnabled: true });

    const removing = useNotificationsStore.getState().removeThisDevice();
    await jest.advanceTimersByTimeAsync(3000);
    await removing;
    jest.useRealTimers();

    expect(useNotificationsStore.getState().pushEnabled).toBe(false);
  });
});
