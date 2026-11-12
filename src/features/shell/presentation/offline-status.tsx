import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { IconName } from '@/core/adaptive/icons';
import { ListRow, ListSection } from '@/core/adaptive/list';
import { GlassStatus } from '@/core/adaptive/map-controls';
import { sessionTrust } from '@/core/auth/session-trust';
import { clearOfflineWriteError } from '@/core/offline/mutate';
import { connectivity } from '@/core/offline/online';
import { offlineSignals } from '@/core/offline/signals';
import { color, motion, space } from '@/core/theme/tokens';

const FLASH_MS = 2500;

export type OfflineStatus = {
  label: string;
  icon: IconName;
  warning?: boolean;
  onPress?: () => void;
};

type Flash = { key: string; count?: number; warning: boolean };
const flashes = createStore(() => ({ flash: null as Flash | null }));

/**
 * For a moment after an action was refused offline, a write could not be stored, or the waiting
 * changes synced. Started once by the root layout while signed in; returns its stop.
 */
export function watchOfflineFlashes(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const show = (flash: Flash) => {
    clearTimeout(timer);
    flashes.setState({ flash });
    timer = setTimeout(() => flashes.setState({ flash: null }), FLASH_MS);
  };
  const unsubscribe = offlineSignals.subscribe((state, prev) => {
    if (state.offlineBlockedAt !== prev.offlineBlockedAt) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      show({ key: 'offline.actionUnavailable', warning: true });
    } else if (state.offlineWriteError && state.offlineWriteError !== prev.offlineWriteError) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      show({ key: state.offlineWriteError, warning: true });
      clearOfflineWriteError();
    } else if (
      prev.pendingCount > 0 &&
      state.pendingCount === 0 &&
      connectivity.getState().online
    ) {
      show({ key: 'offlineSync.synced', count: prev.pendingCount, warning: false });
    }
  });
  return () => {
    unsubscribe();
    clearTimeout(timer);
    flashes.setState({ flash: null });
  };
}

/**
 * What the offline layer has to say (offline-data-cache "Offline banner on every screen",
 * offline-write-sync): a flash first, then changes that could not sync (tap to review), offline
 * with the waiting count, an unverified session, changes still syncing. Null when all is well.
 */
export function useOfflineStatus(): OfflineStatus | null {
  const { t } = useTranslation();
  const flash = useStore(flashes, (s) => s.flash);
  const online = useStore(connectivity, (s) => s.online);
  const unverified = useStore(sessionTrust, (s) => s.unverified);
  const pending = useStore(offlineSignals, (s) => s.pendingCount);
  const dead = useStore(offlineSignals, (s) => s.deadLetters.length);

  if (flash) {
    return {
      label: t(flash.key as never, { count: flash.count }),
      icon: flash.warning ? 'cloud_off' : 'cloud_done',
      warning: flash.warning,
    };
  }
  if (dead) {
    return {
      label: t('offlineSync.deadLetter.banner', { count: dead }),
      icon: 'sync_problem',
      warning: true,
      onPress: () => router.push('/sync-issues'),
    };
  }
  if (!online) {
    return {
      label: pending ? t('offline.bar.waiting', { count: pending }) : t('offline.bar.offline'),
      icon: 'cloud_off',
    };
  }
  if (unverified) return { label: t('offline.bar.unverified'), icon: 'cloud_off' };
  if (pending) return { label: t('offlineSync.pendingCount', { count: pending }), icon: 'sync' };
  return null;
}

/**
 * The status as each page's first row, below its navigation bar, so it never covers a control
 * (the root layout hands it to every `Page`). A row that leads somewhere is a button.
 */
export function OfflineBanner({ status }: { status: OfflineStatus }) {
  return (
    <ListSection>
      <ListRow
        title={status.label}
        icon={status.icon}
        iconColor={status.warning ? color.error : color.onSurfaceVariant}
        chevron={!!status.onPress}
        onPress={status.onPress}
      />
    </ListSection>
  );
}

/**
 * The status on the map, which has no navigation bar: a small glass capsule at the top of the map,
 * clear of its controls in the thumb zone. It fades and never travels (Reduce Motion safe).
 */
export function OfflineCapsule() {
  const insets = useSafeAreaInsets();
  const status = useOfflineStatus();

  // The last status stays drawn while the capsule fades out.
  const [shown, setShown] = useState<OfflineStatus | null>(status);
  if (status && status.label !== shown?.label) setShown(status);
  const [opacity] = useState(() => new Animated.Value(status ? 1 : 0));
  const visible = status !== null;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: motion.short,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setShown(null);
    });
  }, [opacity, visible]);

  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[styles.row, { top: insets.top + space.xxs, opacity }]}
    >
      <GlassStatus
        label={shown.label}
        icon={shown.icon}
        warning={shown.warning}
        onPress={visible ? status?.onPress : undefined}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
