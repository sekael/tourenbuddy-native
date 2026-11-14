import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
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

async function registerToken(): Promise<string> {
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  const environment =
    Platform.OS === 'ios'
      ? await Application.getIosPushNotificationServiceEnvironmentAsync()
      : null;
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
    if (Platform.OS === 'web') return 'denied' as const;
    const { status } = await Notifications.getPermissionsAsync();
    set({ permission: status as PushPermission });
    return status as PushPermission;
  };

  return {
    prefs: null,
    permission: 'undetermined',
    pushEnabled: false,

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
      set({ prefs: null, pushEnabled: false });
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
      if (!uid() || !isReachable() || Platform.OS === 'web') return;
      try {
        if (!enabled) {
          await deleteToken();
          set({ pushEnabled: false });
          return;
        }
        let permission = await refreshPermission();
        if (permission === 'undetermined') {
          const { status } = await Notifications.requestPermissionsAsync();
          permission = status as PushPermission;
          set({ permission });
        }
        if (permission !== 'granted') {
          set({ pushEnabled: false });
          return;
        }
        await registerToken();
        set({ pushEnabled: true });
      } catch (error) {
        log.error('Push toggle failed', error);
        throw error;
      }
    },

    ensurePushToken: async () => {
      if (Platform.OS === 'web') return;
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
        deleteToken().catch((error) => log.warn('Removing the push token failed', error)),
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
