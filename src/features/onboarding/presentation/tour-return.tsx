import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';

import { Icon } from '@/core/adaptive/icon';
import { Text } from '@/core/adaptive/text';
import { color, size, space } from '@/core/theme/tokens';

/**
 * A feature opened from the welcome sheet leads back to it (onboarding-tour): `start` is the sheet's
 * own, so a tour begun at sign-in keeps its Skip and Done. Null while no tour is under way.
 * `dest` is the route the tour's row opened (a tab, or a sheet over the map): the way back shows
 * there only, where the user meant to look, not on the screens on the way to it or beyond it.
 * `arrived` once that route was reached, so the routes passed on the way don't end the tour.
 */
export const useTourReturn = create<{
  start: 'resume' | 'features' | null;
  dest: string | null;
  arrived: boolean;
}>(() => ({ start: null, dest: null, arrived: false }));

/** The tabs' own routes: back on one after the destination, the user has left the tour. */
const TAB_ROOTS = ['/', '/calendar', '/contacts', '/profile'];

/** Opens a tour row's place, remembering it as where the way back shows. */
export function startTourFeature(start: 'resume' | 'features', href: string) {
  useTourReturn.setState({ start, dest: href.split('?')[0]!, arrived: false });
}

/**
 * Follows the current route (root layout): the destination reached marks it arrived; after that,
 * a tab other than the destination (the feature's sheet closed, another tab picked) ends the tour.
 */
export function useFollowTour(pathname: string) {
  useEffect(() => {
    const { start, dest, arrived } = useTourReturn.getState();
    if (!start) return;
    if (pathname === dest) {
      if (!arrived) useTourReturn.setState({ arrived: true });
    } else if (arrived && TAB_ROOTS.includes(pathname)) {
      useTourReturn.setState({ start: null });
    }
  }, [pathname]);
}

/** Whether the way back shows on `pathname`: a tour under way, and this is its destination. */
export function useTourHere(pathname: string) {
  return useTourReturn((s) => s.start !== null && s.dest === pathname);
}

/**
 * Whether the tab bar shows the way back: only for a tour row that opened a tab. A sheet over the
 * map has it as its first row; the router is at the sheet's route a moment before iOS can raise it
 * (the welcome sheet still closing), and the tab bar showed it on the bare map meanwhile.
 */
export function useTourOnTab(pathname: string) {
  const here = useTourHere(pathname);
  return here && TAB_ROOTS.includes(pathname);
}

/** Back to the tour's overview, over whatever sheets the feature opened. */
function backToTour(start: 'resume' | 'features') {
  useTourReturn.setState({ start: null });
  if (router.canDismiss()) router.dismissAll();
  router.push({ pathname: '/welcome', params: { start } });
}

/**
 * The way back for a sheet's first row (`PageReturn`), on the tour's destination only: a sheet
 * further on, or the screens on the way, don't offer it.
 */
export function useTourWayBack(pathname: string) {
  const { t } = useTranslation();
  const start = useTourReturn((s) => s.start);
  const here = useTourHere(pathname);
  return useMemo(
    () =>
      start && here
        ? { label: t('onboarding.tour.controls.back'), onPress: () => backToTour(start) }
        : null,
    [start, here, t],
  );
}

/** The way back, in the tab bar's accessory (iOS 26): back to the tour's overview, or end it. */
export function TourReturn() {
  const { t } = useTranslation();
  const start = useTourReturn((s) => s.start);
  if (!start) return null;
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => backToTour(start)}>
        <Icon name="help" color={color.primary} />
        <Text numberOfLines={1} style={styles.label}>
          {t('onboarding.tour.controls.back')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.tour.controls.finish')}
        hitSlop={space.xs}
        style={styles.end}
        onPress={() => useTourReturn.setState({ start: null })}
      >
        <Icon name="close" color={color.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
  back: {
    flex: 1,
    minHeight: size.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  label: { flexShrink: 1 },
  end: { width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
});
