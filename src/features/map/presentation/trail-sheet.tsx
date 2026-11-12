import { router } from 'expo-router';
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { useFormatter } from '@/core/i18n/format';
import { color, space } from '@/core/theme/tokens';
import { lineLength, trackLine } from '@/features/map/domain/drawn-track';
import type { Trail } from '@/features/map/domain/entities/trail';
import { gpxFromLine } from '@/features/tours/data/services/gpx-writer';
import { labelMinutes } from '@/features/tours/domain/route-metrics';
import { useTourDraftStore } from '@/features/tours/presentation/stores/tour-draft-store';
import { usePace } from '@/features/user/presentation/stores/user-profile-store';

import { planFromRoute } from './plan-from-route';
import { useMapStore, type TrailCard } from './stores/map-store';

type TFn = TFunction;

/** "Target · 2024 m", or the generic label for a route without info. */
export function trailTitle({ route }: Trail, t: TFn): string {
  if (!route) return t('map.trail.skiRoute');
  return route.targetAltitude != null
    ? t('map.trail.target', { name: route.targetName, altitude: route.targetAltitude })
    : route.targetName;
}

/**
 * Ski routes found by a tap (trail-lookup): the candidates nearest first, a route's details as a
 * tour's (its summit, height, grade, SAC's ascent time at the user's pace, climb and descent), the
 * SAC portal, and "Plan as tour", which opens the form on the route's summit with its line as the
 * track.
 */
export function TrailSheet() {
  const card = useMapStore((s) => s.trailCard);
  // The route is singular: a lookup while open replaces the card and starts over. The card stays
  // in the store after closing, so the sheet never empties while it slides away.
  return card ? <TrailCardSheet key={card.candidates.map((c) => c.id).join()} card={card} /> : null;
}

function TrailCardSheet({ card }: { card: TrailCard }) {
  const { t } = useTranslation();
  const [path, setPath] = useState<string[]>(() =>
    card.selectedId && card.candidates.length > 1 ? [card.selectedId] : [],
  );
  const close = () => router.back();
  const single = card.candidates.length === 1 ? card.candidates[0]! : null;
  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(id) => {
        const trail = card.candidates.find((c) => c.id === id);
        return trail ? <TrailPage trail={trail} /> : null;
      }}
    >
      {single ? (
        <TrailPage trail={single} onClose={close} />
      ) : (
        <Page
          title={t('map.trail.listTitle', { count: card.candidates.length + card.more })}
          onClose={close}
        >
          <ListSection
            footer={card.more > 0 ? t('map.trail.more', { count: card.more }) : undefined}
          >
            {card.candidates.map((trail) => (
              <ListRow
                key={trail.id}
                title={trailTitle(trail, t)}
                subtitle={
                  [trail.route?.difficulty, trail.route?.name].filter(Boolean).join(' · ') ||
                  undefined
                }
                icon="ski_touring"
                onPress={() => setPath([trail.id])}
              />
            ))}
          </ListSection>
        </Page>
      )}
    </Screen>
  );
}

function TrailPage({ trail, onClose }: { trail: Trail; onClose?: () => void }) {
  const { t, i18n } = useTranslation();
  const { formatElevation, formatDuration, formatDistance } = useFormatter();
  const pace = usePace();
  const [planning, setPlanning] = useState(false);
  const route = trail.route;

  async function plan() {
    if (!route) return;
    setPlanning(true);
    try {
      const planned = await planFromRoute(route, trail.lines, i18n.language);
      if (!planned) return;
      const store = useTourDraftStore.getState();
      store.begin('create', null, planned.seed);
      useTourDraftStore.setState({ goal: planned.goal });
      const line = trackLine(planned.track);
      store.setTrack({
        text: gpxFromLine(line, null, route.targetName),
        label: t('tours.form.gpxDrawnFile', { distance: formatDistance(lineLength(line)) }),
        line,
        drawing: planned.track,
      });
      store.update({
        startPoint: { lng: line[0]![0], lat: line[0]![1] },
        endPoint: { lng: line.at(-1)![0], lat: line.at(-1)![1] },
      });
      router.replace('/tour/edit');
    } finally {
      setPlanning(false);
    }
  }

  if (!route) {
    return (
      <Page title={t('map.trail.skiRoute')} onClose={onClose}>
        <EmptyState icon="info" title={t('map.trail.noInfo')} />
      </Page>
    );
  }
  const minutes = route.ascentTime ? labelMinutes(route.ascentTime) : null;
  const ascentTime =
    minutes == null ? route.ascentTime : formatDuration(Math.round(minutes / pace));
  return (
    <Page
      title={route.targetName}
      onClose={onClose}
      header={
        <View style={styles.hero}>
          {route.targetAltitude != null ? (
            <Text variant="title">{formatElevation(route.targetAltitude)}</Text>
          ) : null}
          {route.name ? <Text>{route.name}</Text> : null}
        </View>
      }
    >
      <ListSection>
        {route.difficulty ? (
          <ListRow title={t('tours.filters.gradeLabel')} value={route.difficulty} icon="speed" />
        ) : null}
        {ascentTime ? (
          <ListRow title={t('map.trail.ascentTime')} value={ascentTime} icon="schedule" />
        ) : null}
        {route.ascentM ? (
          <ListRow
            title={t('tours.route.ascent')}
            value={`↑ ${formatElevation(route.ascentM)}`}
            icon="arrow_upward"
          />
        ) : null}
        {route.descentM ? (
          <ListRow
            title={t('tours.route.descent')}
            value={`↓ ${formatElevation(route.descentM)}`}
            icon="arrow_downward"
          />
        ) : null}
      </ListSection>
      <ListSection>
        <ListRow
          title={t('map.trail.planTour')}
          icon="add_location_alt"
          disabled={planning}
          onPress={() => void plan()}
        />
        {route.sacUrl ? (
          <ListRow
            title={t('map.trail.openSac')}
            icon="open_in_new"
            onPress={() => void Linking.openURL(route.sacUrl!)}
          />
        ) : null}
      </ListSection>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xxs, paddingVertical: space.xs },
  meta: { color: color.onSurfaceVariant },
});
