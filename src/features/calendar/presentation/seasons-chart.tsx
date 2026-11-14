import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/core/adaptive/text';
import { color, radius, space, strong } from '@/core/theme/tokens';
import { SEASON_AXIS, seasonRuns } from '@/features/calendar/domain/season-runs';
import { TOUR_TYPE_COLORS, TOUR_TYPE_I18N_KEYS } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';

const BAR = 10;

/**
 * The Seasons view's chart (calendar-view "Seasons view shows owned tours by season"): the four
 * season columns Winter to Autumn with their months, and per own tour one bar for each run of
 * adjacent seasons it is tagged with, in its activity's colour. A thin line marks today. On a
 * phone the name sits above its bars, so all four columns fit without scrolling.
 */
export function SeasonsChart({ tours, onOpen }: { tours: Tour[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  // The axis runs December to November, winter first: December is slot 0.
  const now = `${(((new Date().getMonth() + 1) % 12) + 0.5) / 0.12}%` as const;

  return (
    <View style={styles.card}>
      <View style={styles.axis}>
        {SEASON_AXIS.map((season) => (
          <View key={season} style={styles.column}>
            <Text variant="caption" style={strong}>
              {t(`tours.season.${season}`)}
            </Text>
            <Text variant="caption" style={styles.muted}>
              {t(`calendar.seasons.range.${season}`)}
            </Text>
          </View>
        ))}
      </View>
      <View>
        {tours.map((tour) => {
          const runs = seasonRuns(tour.seasons ?? null);
          const type = tour.tourTypes[0];
          const seasons = (tour.seasons ?? []).map((s) => t(`tours.season.${s}`)).join(', ');
          const name = tour.name ?? t('tours.infoSheet.unnamedTour');
          return (
            <Pressable
              key={tour.id}
              role="button"
              aria-label={`${name}, ${seasons || t('calendar.seasons.empty')}`}
              onPress={() => onOpen(tour.id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text numberOfLines={1}>{name}</Text>
              {type ? (
                <Text variant="caption" numberOfLines={1} style={styles.muted}>
                  {tour.tourTypes
                    .map((tt) => t(`tours.type.${TOUR_TYPE_I18N_KEYS[tt]}` as never))
                    .join(', ')}
                </Text>
              ) : null}
              <View style={styles.track}>
                {runs.length ? (
                  runs.map((run, i) => (
                    <View
                      key={i}
                      style={[
                        styles.bar,
                        {
                          left: `${(run.start / 4) * 100}%`,
                          width: `${(run.span / 4) * 100}%`,
                          backgroundColor: type ? TOUR_TYPE_COLORS[type] : color.primary,
                        },
                      ]}
                    />
                  ))
                ) : (
                  <Text variant="caption" style={styles.muted}>
                    {t('calendar.seasons.empty')}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
        <View pointerEvents="none" style={[styles.now, { left: now }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: space.sm,
    backgroundColor: color.background,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginVertical: space.xs,
  },
  axis: {
    flexDirection: 'row',
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  column: { flex: 1, alignItems: 'center' },
  muted: { color: color.onSurfaceVariant },
  row: {
    paddingVertical: space.xs,
    gap: space.xxs / 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  pressed: { backgroundColor: color.neutralContainer },
  track: { height: BAR + space.xxs, justifyContent: 'center' },
  bar: { position: 'absolute', height: BAR, borderRadius: BAR / 2 },
  now: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: color.error,
  },
});
