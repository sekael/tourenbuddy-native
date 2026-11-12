import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLatest } from '@/core/use-latest';
import { ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useFormatter } from '@/core/i18n/format';
import { isOnline } from '@/core/offline/online';
import {
  lineLength,
  trackLine,
  trackFromLine,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { snapNetworkFor } from '@/features/map/domain/snap-network';
import { tapSnapM } from '@/features/map/presentation/leg-router';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import { ElevationProfile } from '@/features/map/presentation/elevation-profile';
import { useTrackDrawing } from '@/features/map/presentation/use-track-drawing';
import { TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type';
import { gpxFromLine } from '@/features/tours/data/services/gpx-writer';
import { densify, getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';
import { estimatedMinutes, onSkis } from '@/features/tours/domain/route-metrics';
import { usePace } from '@/features/user/presentation/stores/user-profile-store';

import { useTourDraftStore } from './stores/tour-draft-store';

/** Where the drawing starts: the draft's drawing or track, else its start, goal and end. */
function seedTrack(): DrawnTrack | null {
  const { track, draft, goal } = useTourDraftStore.getState();
  if (track?.drawing) return track.drawing;
  if (track?.line.length) return trackFromLine(track.line);
  if (!goal) return null;
  const ll = (p: { lng: number; lat: number }): LngLat => [p.lng, p.lat];
  const points = [draft.startPoint, goal, draft.endPoint].filter((p) => p !== null).map(ll);
  return { points, legs: [], goal: draft.startPoint ? 1 : 0 };
}

/**
 * Drawing a track (track-drawing, D4) on the live map, in a small sheet: each tap adds a point,
 * joined to the one before along the shown trails; undo, redo, back to the start, live distance,
 * climb, descent and time at the user's pace. Done hands the line to the form as its GPX.
 */
export function DrawSheet() {
  const { t } = useTranslation();
  const { formatElevation, formatDistance, formatDuration } = useFormatter();
  const overlays = useMapStore((s) => s.overlays);
  const pace = usePace();
  const types = useTourDraftStore.getState().draft.tourTypes;
  const network = snapNetworkFor(overlays, types);
  const [seed] = useState(seedTrack);
  const drawing = useTrackDrawing(seed, network);
  const [saving, setSaving] = useState(false);
  const addRef = useLatest(drawing.add);

  useEffect(() => {
    useMapStore.getState().beginStep('draw', (point) => {
      const { zoom } = useMapStore.getState();
      addRef.current(point, tapSnapM(point[1], zoom ?? 13));
    });
    return () => useMapStore.getState().endStep();
  }, [addRef]);

  // The drawing on the map: its line, its points and the taps still waiting for their leg.
  const { track, queued } = drawing;
  useEffect(() => {
    const color = types[0] ? TOUR_TYPE_TRACK_COLORS[types[0]] : '#334155';
    const line = trackLine(track);
    useMapStore.setState({
      previewLines: {
        type: 'FeatureCollection',
        features:
          line.length > 1
            ? [
                {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: line },
                  properties: { color, width: 4, casing: true },
                },
              ]
            : [],
      },
      previewPoints: {
        type: 'FeatureCollection',
        features: [...track.points, ...queued].map((p, i) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: p },
          properties: {
            kind: (i === 0 ? 'start' : i === track.goal ? 'preview' : 'end') as
              'start' | 'end' | 'preview',
          },
        })),
      },
    });
  }, [track, queued, types]);

  const { metrics } = drawing;
  const minutes = estimatedMinutes(metrics, onSkis(types), pace);
  const numbers = [
    metrics.distance ? formatDistance(metrics.distance) : null,
    metrics.ascent ? `↑ ${formatElevation(metrics.ascent)}` : null,
    metrics.descent ? `↓ ${formatElevation(metrics.descent)}` : null,
    minutes ? formatDuration(minutes) : null,
  ]
    .filter(Boolean)
    .join('  ');

  async function done() {
    const line = trackLine(track);
    const store = useTourDraftStore.getState();
    if (line.length < 2) {
      if (store.track?.drawing) store.setTrack(null);
      router.replace('/tour/edit');
      return;
    }
    setSaving(true);
    try {
      const profiled = isOnline() ? await getTrackProfile(line).catch(() => null) : null;
      const name = store.draft.name?.trim() || t('tours.form.gpxDrawn');
      store.setTrack({
        text: gpxFromLine(profiled?.line ?? densify(line), profiled?.heights ?? null, name),
        label: t('tours.form.gpxDrawnFile', { distance: formatDistance(lineLength(line)) }),
        line,
        drawing: track,
      });
      // The drawing's ends are the route's start and end, unless a goal keeps its own.
      if (track.goal == null) {
        store.update({
          startPoint: { lng: line[0]![0], lat: line[0]![1] },
          endPoint: { lng: line.at(-1)![0], lat: line.at(-1)![1] },
        });
      }
      router.replace('/tour/edit');
    } finally {
      setSaving(false);
    }
  }

  const status =
    drawing.issue === 'unavailable'
      ? t('map.draw.status.unavailable')
      : network === 'ski'
        ? t('map.draw.status.ski')
        : network === 'hiking'
          ? t('map.draw.status.hiking')
          : t('map.draw.status.ways');

  return (
    <Screen>
      <Page
        title={t('map.draw.title')}
        header={
          drawing.profile && track.points.length > 1 ? (
            <ElevationProfile line={drawing.profile.line} heights={drawing.profile.heights} />
          ) : undefined
        }
        cancel={{ label: t('common.back'), onPress: () => router.replace('/tour/edit') }}
        confirm={{
          label: t('map.draw.done'),
          onPress: () => void done(),
          disabled: drawing.busy || saving,
        }}
        actions={[
          {
            id: 'undo',
            label: t('map.draw.undo'),
            icon: 'undo',
            disabled: !drawing.canUndo,
            onPress: drawing.undo,
          },
          {
            id: 'redo',
            label: t('map.draw.redo'),
            icon: 'redo',
            disabled: !drawing.canRedo,
            onPress: drawing.redo,
          },
        ]}
      >
        <ListSection footer={status}>
          <ListRow
            title={
              numbers || (track.points.length ? t('map.draw.hint.next') : t('map.draw.hint.start'))
            }
            subtitle={
              track.points.length > 1 && !metrics.ascent
                ? isOnline()
                  ? t('map.draw.hint.profileLoading')
                  : t('map.draw.hint.profileOffline')
                : undefined
            }
            icon="route"
          />
          {!drawing.closed && track.legs.length > 0 ? (
            <ListRow
              title={t('map.draw.returnToStart')}
              subtitle={t('map.draw.returnToStartHint')}
              icon="u_turn_left"
              disabled={drawing.busy}
              onPress={drawing.returnToStart}
            />
          ) : null}
          {track.points.length > 0 ? (
            <ListRow
              title={t('map.draw.clear')}
              icon="delete"
              destructive
              onPress={drawing.clear}
            />
          ) : null}
        </ListSection>
      </Page>
    </Screen>
  );
}
