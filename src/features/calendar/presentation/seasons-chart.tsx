import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import { Text } from '@/core/adaptive/text';
import { color, radius, space, strong } from '@/core/theme/tokens';
import { SEASON_AXIS, seasonRuns } from '@/features/calendar/domain/season-runs';
import { TOUR_TYPE_I18N_KEYS } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { tourIcon } from '@/features/tours/presentation/tour-rows';

const BAR = 22;
/** The axis grows with Dynamic Type only so far, as a tab bar's labels: four seasons share a phone. */
const AXIS_SCALE = 1.4;

/** Tours in the axis' order: by their first season, then the longer run, then name; none last. */
function bySeason(tours: Tour[]) {
  const key = (tour: Tour) => seasonRuns(tour.seasons ?? null)[0];
  return [...tours].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka || !kb) return ka ? -1 : kb ? 1 : (a.name ?? '').localeCompare(b.name ?? '');
    return ka.start - kb.start || kb.span - ka.span || (a.name ?? '').localeCompare(b.name ?? '');
  });
}

/**
 * The Seasons view (calendar-view "Seasons view shows owned tours by season"), the PWA's chart
 * fitted to a phone: the four seasons Winter to Autumn with their months as columns, pinned above
 * the tours while they scroll; per own tour its activity, name and activities across the full
 * width, under them one bar for each run of adjacent seasons it suits, in its activity's colour,
 * on a rail of the same columns; a tour without seasons says so. Today's season is tinted on
 * every rail and named in the brand colour.
 */
export function SeasonsChart({ tours, onOpen }: { tours: Tour[]; onOpen: (id: string) => void }) {
  const { t } = useTranslation();
  // The axis runs December to November, winter first: December is slot 0.
  const season = Math.floor(((new Date().getMonth() + 1) % 12) / 3);
  const sorted = useMemo(() => bySeason(tours), [tours]);

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Pinned, React Native moves this view's style to its own wrapper: the row is the next one. */}
      <View style={styles.pinned}>
        <View style={styles.header}>
          {SEASON_AXIS.map((name, i) => (
            <View key={name} style={styles.column} accessible accessibilityRole="header">
              <Text
                variant="caption"
                numberOfLines={1}
                maxFontSizeMultiplier={AXIS_SCALE}
                style={[strong, styles.centered, i === season && styles.current]}
              >
                {t(`tours.season.${name}`)}
              </Text>
              <Text
                variant="axis"
                numberOfLines={1}
                maxFontSizeMultiplier={AXIS_SCALE}
                style={[styles.muted, styles.centered]}
              >
                {t(`calendar.seasons.range.${name}`)}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.card}>
        {sorted.map((tour, i) => {
          const runs = seasonRuns(tour.seasons ?? null);
          const { icon, tint } = tourIcon(tour);
          const name = tour.name ?? t('tours.infoSheet.unnamedTour');
          const types = tour.tourTypes
            .map((type) => t(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}` as never))
            .join(', ');
          const seasons = SEASON_AXIS.filter((s) => tour.seasons?.includes(s))
            .map((s) => t(`tours.season.${s}`))
            .join(', ');
          return (
            <Pressable
              key={tour.id}
              role="button"
              aria-label={[name, types, seasons || t('calendar.seasons.empty')]
                .filter(Boolean)
                .join(', ')}
              onPress={() => onOpen(tour.id)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.divided,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.title}>
                <Icon name={icon} size={20} color={tint} />
                <View style={styles.names}>
                  <Text numberOfLines={3}>{name}</Text>
                  {types ? (
                    <Text variant="caption" numberOfLines={1} style={styles.muted}>
                      {types}
                    </Text>
                  ) : null}
                </View>
              </View>
              {/* A rail of the four seasons, today's tinted, the tour's runs over it. */}
              <View style={styles.rail}>
                <View style={[styles.quarter, styles.today, { left: `${season * 25}%` }]} />
                {[1, 2, 3].map((k) => (
                  <View key={k} style={[styles.cut, { left: `${k * 25}%` }]} />
                ))}
                {runs.length ? (
                  runs.map((run) => (
                    <View
                      key={run.start}
                      style={[
                        styles.bar,
                        {
                          left: `${run.start * 25}%`,
                          width: `${run.span * 25}%`,
                          backgroundColor: tint,
                        },
                      ]}
                    />
                  ))
                ) : (
                  <Text variant="caption" numberOfLines={1} style={[styles.muted, styles.none]}>
                    {t('calendar.seasons.empty')}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, paddingBottom: space.xxl },
  pinned: { backgroundColor: color.groupedBackground },
  // The card's own inset, so the columns stand over the rows' rails.
  header: { flexDirection: 'row', paddingVertical: space.xs, paddingHorizontal: space.sm },
  column: { flex: 1, paddingHorizontal: space.xxs / 2 },
  centered: { textAlign: 'center' },
  current: { color: color.primary },
  muted: { color: color.onSurfaceVariant },
  card: { backgroundColor: color.background, borderRadius: radius.md, overflow: 'hidden' },
  row: { gap: space.xs, paddingVertical: space.sm, paddingHorizontal: space.sm },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.outlineVariant },
  pressed: { backgroundColor: color.neutralContainer },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  names: { flex: 1, gap: space.xxs / 2 },
  rail: {
    minHeight: BAR,
    borderRadius: BAR / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: color.neutralContainer,
  },
  quarter: { position: 'absolute', top: 0, bottom: 0, width: '25%' },
  today: { backgroundColor: color.secondaryContainer },
  cut: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: space.xxs / 2,
    marginLeft: -space.xxs / 4,
    backgroundColor: color.background,
  },
  bar: { position: 'absolute', top: 0, bottom: 0, borderRadius: BAR / 2 },
  none: { fontStyle: 'italic', textAlign: 'center' },
});
