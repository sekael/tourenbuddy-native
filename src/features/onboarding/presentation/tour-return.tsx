import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';

import { Icon } from '@/core/adaptive/icon';
import { Text } from '@/core/adaptive/text';
import { color, size, space } from '@/core/theme/tokens';

/**
 * A feature opened from the welcome sheet leads back to it (onboarding-tour): `start` is the sheet's
 * own, so a tour begun at sign-in keeps its Skip and Done. Null while no tour is under way.
 */
export const useTourReturn = create<{ start: 'resume' | 'features' | null }>(() => ({
  start: null,
}));

/** Back to the tour's overview, over whatever sheets the feature opened. */
function backToTour(start: 'resume' | 'features') {
  useTourReturn.setState({ start: null });
  if (router.canDismiss()) router.dismissAll();
  router.push({ pathname: '/welcome', params: { start } });
}

/** The way back for a sheet's bottom bar (`PageReturn`), while a tour is under way. */
export function useTourWayBack() {
  const { t } = useTranslation();
  const start = useTourReturn((s) => s.start);
  return useMemo(
    () =>
      start
        ? { label: t('onboarding.tour.controls.back'), onPress: () => backToTour(start) }
        : null,
    [start, t],
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
