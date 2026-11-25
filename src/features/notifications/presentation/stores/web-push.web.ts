import { env } from '@/core/env';
import { createLogger } from '@/core/logging/logger';
import { supabase } from '@/core/supabase';

const log = createLogger('WebPush');

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** This browser's live subscription, or null when push is off or unsupported here. */
async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported() || Notification.permission !== 'granted') return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** RPC, not an upsert: an endpoint another account left on a shared browser is reassigned. */
async function register(subscription: PushSubscription) {
  const keys = subscription.toJSON().keys ?? {};
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh ?? '',
    p_auth: keys.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const raw = atob((base64String + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Web Push for THIS browser only (the PWA's `useWebPush`, #148): the browser's PushManager
 * subscription is the truth, mirrored as one `push_subscriptions` row.
 */
export const webPush = {
  permission: (): 'granted' | 'denied' | 'undetermined' => {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission === 'default' ? 'undetermined' : Notification.permission;
  },

  async subscribe(): Promise<boolean> {
    if (!supported()) {
      log.warn('Web Push not supported');
      return false;
    }
    const vapidKey = env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      log.warn('EXPO_PUBLIC_VAPID_PUBLIC_KEY is not set: cannot subscribe to Web Push');
      return false;
    }
    try {
      if ((await Notification.requestPermission()) !== 'granted') return false;
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));
      await register(subscription);
      return true;
    } catch (error) {
      log.error('Failed to subscribe to push', error);
      return false;
    }
  },

  /** This device only: drop its row, then the browser subscription. Never throws. */
  async unsubscribe(): Promise<void> {
    let subscription: PushSubscription | null = null;
    try {
      subscription = await currentSubscription();
    } catch (error) {
      log.error('Failed to read browser push subscription', error);
    }
    if (!subscription) return;
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint);
    if (error) log.error("Failed to remove this device's push subscription row", error);
    await subscription
      .unsubscribe()
      .catch((e: unknown) => log.error('Browser unsubscribe failed', e));
  },

  /**
   * On app start: a subscribed browser (re-)registers its row, healing one the Worker deleted
   * after a 410. Returns whether this device has push on.
   */
  async ensureSubscription(): Promise<boolean> {
    try {
      const subscription = await currentSubscription();
      if (!subscription) return false;
      await register(subscription);
      return true;
    } catch (error) {
      log.error('Failed to ensure push subscription', error);
      return false;
    }
  },
};
