import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { bounded } from '@/core/async';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { clearCached, getCached, putCached } from '@/core/offline/entity-cache';
import { mutate } from '@/core/offline/mutate';
import { isReachable } from '@/core/offline/online';
import { flushThenRefetch, registerReplay } from '@/core/offline/replay';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import { supabase } from '@/core/supabase';
import { NotificationPreferencesRepositoryImpl } from '@/features/notifications/data/repositories/notification-preferences-repository-impl';
import type {
  NotificationPreferences,
  NotificationType,
} from '@/features/notifications/domain/entities/notification-preferences';
import { webPush } from './web-push';

/**
 * Notification settings (notifications, native-push): email and the muted types, synced with
 * the profile row and queued offline like the PWA's; push is this device's alone, an OS push
 * token registered with the backend (`register_device_push_token`) and deleted again when the
 * user turns it off or signs out, so other devices are never silenced.
 */
const log = createLogger('NotificationsStore');
const prefsRepository = new NotificationPreferencesRepositoryImpl();
const uid = () => sessionUser.getState().id;
/** The token this install registered, per device: sign-out deletes exactly that row. */
const TOKEN_KEY = 'push-token:device';

registerReplay('notif-prefs', async (entry: WriteQueueEntry) => {
  const userId = entry.entityId.replace(/^notif:/, '');
  await prefsRepository.updatePreferences(userId, entry.payload as NotificationPreferences);
});

export type PushPermission = 'granted' | 'denied' | 'undetermined';

type NotificationsState = {
  prefs: NotificationPreferences | null;
  permission: PushPermission;
  /** Push on for this device: permission granted and its token registered. */
  pushEnabled: boolean;
  /** Switching push on: asking the system and registering the token (the switch shows it on). */
  pushPending: boolean;
  start: () => void;
  clear: () => void;
  loadPrefs: () => Promise<void>;
  setPushEnabled: (enabled: boolean) => Promise<void>;
  /** Re-registers a token the OS rotated, while push stays on (each launch). */
  ensurePushToken: () => Promise<void>;
  /** Sign-out: the device's row goes while the session can still delete it. */
  removeThisDevice: () => Promise<void>;
  setEmailEnabled: (enabled: boolean) => Promise<void>;
  setTypeMuted: (type: NotificationType, muted: boolean) => Promise<void>;
};

let unsubscribe: (() => void) | null = null;

/**
 * The app icon's badge: what the Profile tab counts (unread, still actionable inbox entries). iOS
 * shows it only once notifications are allowed; a push sets it while the app is closed.
 */
export function setAppBadge(count: number) {
  if (Platform.OS === 'web') return;
  Notifications.setBadgeCountAsync(count).catch((error) => log.warn('App badge failed', error));
}

/**
 * Nobody signed in (a launch without a session, after any sign-out): no badge, nothing left in
 * Notification Center, and no pushes for an account that's gone from this device. A token whose row
 * sign-out couldn't delete (offline, an expired session) is still cached: it is unregistered from
 * APNs, so its pushes stop and the Worker deletes the row when APNs reports it gone.
 */
export async function forgetSignedOutDevice() {
  if (Platform.OS === 'web') return;
  setAppBadge(0);
  Notifications.dismissAllNotificationsAsync().catch((error) =>
    log.warn('Clearing delivered notifications failed', error),
  );
  const token = await getCached<string>(TOKEN_KEY).catch(() => undefined);
  if (!token) return;
  try {
    await Notifications.unregisterForNotificationsAsync();
    await clearCached(TOKEN_KEY);
  } catch (error) {
    log.warn('Unregistering a signed-out push token failed', error);
  }
}

/**
 * The APNs environment of this install's token (backend design D3): the provisioning profile's
 * `aps-environment`. A build without a profile reads null: App Store and TestFlight builds (Apple
 * strips the profile) send production tokens, the Simulator sandbox ones.
 */
async function apnsEnvironment(): Promise<'development' | 'production'> {
  const fromProfile = await Application.getIosPushNotificationServiceEnvironmentAsync();
  if (fromProfile) return fromProfile;
  const release = await Application.getIosApplicationReleaseTypeAsync();
  return release === Application.ApplicationReleaseType.SIMULATOR ? 'development' : 'production';
}

/**
 * How long the system may take to hand out a token. iOS answers only through a callback; when it
 * never comes (a stalled APNs registration, seen on simulators after a permission change) the
 * switch would wait forever with nothing to show.
 */
const TOKEN_WAIT_MS = 15_000;

/** The system never handed out a push token (not a network failure: the page says so). */
export class PushTokenTimeout extends Error {
  constructor() {
    super('The system gave no push token');
  }
}

async function registerToken(): Promise<string> {
  const answer = await bounded(Notifications.getDevicePushTokenAsync(), TOKEN_WAIT_MS);
  if (answer === 'timeout') throw new PushTokenTimeout();
  const token = answer.data;
  const environment = Platform.OS === 'ios' ? await apnsEnvironment() : null;
  const { error } = await supabase.rpc('register_device_push_token', {
    p_token: String(token),
    p_platform: Platform.OS,
    p_app_id: Application.applicationId,
    p_apns_environment: environment,
    p_app_version: Application.nativeApplicationVersion,
  });
  if (error) throw new Error(error.message);
  await putCached(TOKEN_KEY, String(token));
  return String(token);
}

async function deleteToken() {
  const token = await getCached<string>(TOKEN_KEY).catch(() => undefined);
  if (!token) return;
  const { error } = await supabase.from('device_push_tokens').delete().eq('token', token);
  if (error) throw new Error(error.message);
  await clearCached(TOKEN_KEY);
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => {
  const persist = (updated: NotificationPreferences) => {
    const me = uid()!;
    return mutate<NotificationPreferences>({
      run: async () => {
        await prefsRepository.updatePreferences(me, updated);
        set({ prefs: updated });
      },
      intent: {
        entityId: `notif:${me}`,
        kind: 'notif-prefs',
        op: 'update',
        payload: updated,
        baseSnapshot: get().prefs,
      },
      cacheKey: `notif-prefs:${me}`,
      current: get().prefs ? [get().prefs!] : [],
      apply: () => [updated],
      assign: (rows) => set({ prefs: rows[0] ?? null }),
    });
  };

  const refreshPermission = async () => {
    if (Platform.OS === 'web') {
      const permission = webPush.permission();
      set({ permission });
      return permission;
    }
    const { status } = await Notifications.getPermissionsAsync();
    set({ permission: status as PushPermission });
    return status as PushPermission;
  };

  return {
    prefs: null,
    permission: 'undetermined',
    pushEnabled: false,
    pushPending: false,

    start: () => {
      const me = uid();
      if (!me || unsubscribe) return;
      unsubscribe = subscribeRealtime({
        topic: `notification-settings-${me}`,
        postgres: [{ event: '*', table: 'user_profile', filter: `id=eq.${me}` }],
        onChange: () => void get().loadPrefs(),
        onSubscribed: () => void flushThenRefetch(get().loadPrefs),
      });
      void get().loadPrefs();
      void get().ensurePushToken();
    },

    clear: () => {
      unsubscribe?.();
      unsubscribe = null;
      set({ prefs: null, pushEnabled: false, pushPending: false });
      setAppBadge(0);
    },

    loadPrefs: async () => {
      const me = uid();
      if (!me) return;
      try {
        await cachedLoad<NotificationPreferences[]>(
          `notif-prefs:${me}`,
          async () => {
            const fetched = await prefsRepository.getPreferences(me);
            return fetched ? [fetched] : [];
          },
          (rows) => {
            if (uid() === me) set({ prefs: rows[0] ?? null });
          },
        );
      } catch (error) {
        log.error('Failed to load notification prefs', error);
      }
    },

    setPushEnabled: async (enabled) => {
      if (!uid() || !isReachable()) return;
      if (Platform.OS === 'web') {
        // This browser only, never queued (the PWA's toggle): subscribing needs the network.
        if (enabled) {
          set({ pushPending: true });
          const on = await webPush.subscribe();
          set({ pushEnabled: on, pushPending: false });
          await refreshPermission();
        } else {
          await webPush.unsubscribe();
          set({ pushEnabled: false });
        }
        return;
      }
      try {
        if (!enabled) {
          await deleteToken();
          set({ pushEnabled: false });
          return;
        }
        set({ pushPending: true });
        let permission = await refreshPermission();
        if (permission === 'undetermined') {
          const { status } = await Notifications.requestPermissionsAsync();
          permission = status as PushPermission;
          set({ permission });
        }
        if (permission !== 'granted') {
          // The page shows the denied state and the way to Settings.
          log.debug(`Push stays off: permission ${permission}`);
          set({ pushEnabled: false, pushPending: false });
          return;
        }
        await registerToken();
        set({ pushEnabled: true, pushPending: false });
      } catch (error) {
        set({ pushPending: false });
        // The page tells the user; a developer error screen over it would hide that.
        log.warn('Push toggle failed', error);
        throw error;
      }
    },

    ensurePushToken: async () => {
      if (Platform.OS === 'web') {
        await refreshPermission();
        set({ pushEnabled: await webPush.ensureSubscription() });
        return;
      }
      try {
        const [permission, token] = await Promise.all([
          refreshPermission(),
          getCached<string>(TOKEN_KEY).catch(() => undefined),
        ]);
        if (permission !== 'granted' || !token) {
          set({ pushEnabled: false });
          return;
        }
        set({ pushEnabled: true });
        if (isReachable()) await registerToken();
      } catch (error) {
        log.warn('Push token refresh failed', error);
      }
    },

    removeThisDevice: async () => {
      // Bounded: sign-out must not hang on a slow network.
      await Promise.race([
        Platform.OS === 'web'
          ? webPush.unsubscribe()
          : deleteToken().catch((error) => log.warn('Removing the push token failed', error)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      set({ pushEnabled: false });
    },

    setEmailEnabled: async (enabled) => {
      const prefs = get().prefs;
      if (!uid() || !prefs) return;
      await persist({ ...prefs, notifEmailEnabled: enabled });
    },

    setTypeMuted: async (type, muted) => {
      const prefs = get().prefs;
      if (!uid() || !prefs) return;
      const next = muted
        ? [...new Set([...prefs.notifMutedTypes, type])]
        : prefs.notifMutedTypes.filter((t) => t !== type);
      await persist({ ...prefs, notifMutedTypes: next });
    },
  };
});
