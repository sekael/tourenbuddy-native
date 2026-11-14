import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLatest } from '@/core/use-latest';
import { ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useFormatter } from '@/core/i18n/format';
import { isOnline } from '@/core/offline/online';
import {
  routeStops,
  trackFromLine,
  trackLine,
  withGoal,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { initialFollow, type Follow } from '@/features/map/domain/snap-network';
import { tapSnapM } from '@/features/map/presentation/leg-router';
import { useMapStore, type HandleTarget } from '@/features/map/presentation/stores/map-store';
import { ElevationProfile } from '@/features/map/presentation/elevation-profile';
import { FollowSection } from '@/features/map/presentation/follow-section';
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
  // A track from a file: its turning points, the goal among them when the line passes it.
  if (track?.line.length) {
    const line = trackFromLine(track.line);
    return (goal && withGoal(line, [goal.lng, goal.lat])) || line;
  }
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
  const [follow, setFollow] = useState<Follow>(() => initialFollow(overlays, types));
  /** A new tour's activity follows the line (ski routes: a ski tour) until the user picks one. */
  const changeFollow = (next: Follow) => {
    setFollow(next);
    useTourDraftStore.getState().followed(next);
  };
  const [seed] = useState(seedTrack);
  const drawing = useTrackDrawing(seed, follow);
  const [saving, setSaving] = useState(false);
  const drawingRef = useLatest(drawing);
  /** A point or leg's dot picked by a tap: the next map tap moves it or sends the leg there. */
  const [picked, setPicked] = useState<HandleTarget | null>(null);
  const pickedRef = useLatest(picked);

  useEffect(() => {
    useMapStore.getState().beginStep('draw', (point) => {
      const target = pickedRef.current;
      const draw = drawingRef.current;
      if (target && 'point' in target) draw.move(target.point, point, snapRadius(point));
      else if (target) draw.pull(target.leg, point, snapRadius(point));
      else draw.add(point, snapRadius(point));
      setPicked(null);
    });
    return () => useMapStore.getState().endStep();
  }, [drawingRef, pickedRef]);

  // The drawing on the map: its line, its points and the taps still waiting for their leg.
  const { track, queued } = drawing;
  useEffect(() => {
    const remove = (index: number) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPicked(null);
      drawingRef.current.drop(index);
    };
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
      // The points are handles (`editHandles`); a tap still waiting for its leg shows here.
      previewPoints: {
        type: 'FeatureCollection',
        // A plain dot, not an end flag: the line has one end, its last point.
        features: queued.map((p) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: p },
          properties: { kind: 'preview' as const },
        })),
      },
      editHandles: {
        points: track.points.map((at, i) => ({
          at,
          kind:
            i === track.goal
              ? 'goal'
              : i === 0
                ? 'start'
                : i === track.points.length - 1
                  ? 'end'
                  : 'via',
        })),
        legs: track.legs,
        move: (i, to) => drawingRef.current.move(i, to, snapRadius(to)),
        pull: (leg, at) => drawingRef.current.pull(leg, at, snapRadius(at)),
        drop: (i) => remove(i),
        // A tap on a point takes it out (track-drawing "Remove a point"), the goal excepted: a tap
        // on it, or on a leg's dot, picks it for the next map tap.
        pick: (target) => {
          if ('point' in target && target.point !== track.goal) {
            remove(target.point);
            return;
          }
          void Haptics.selectionAsync();
          setPicked((p) => (JSON.stringify(p) === JSON.stringify(target) ? null : target));
        },
        picked,
      },
    });
  }, [track, queued, types, drawingRef, picked]);

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
        label: t('tours.form.gpxDrawn'),
        line,
        drawing: track,
      });
      // One start and one end, where the line begins and ends (a goal at either end is the goal).
      if (track.goal == null) store.setEnds(line[0]!, line.at(-1)!);
      else {
        const { start, end } = routeStops({ ...track, goal: track.goal });
        store.setEnds(start, end);
      }
      router.replace('/tour/edit');
    } finally {
      setSaving(false);
    }
  }

  const status =
    follow === 'straight'
      ? t('map.plan.follow.straight')
      : drawing.issue === 'unavailable'
        ? t('map.draw.status.unavailable')
        : follow === 'ski'
          ? t('map.draw.status.ski')
          : t('map.draw.status.hiking');

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
        <ListSection
          footer={
            picked
              ? 'point' in picked
                ? t('map.plan.hint.move')
                : t('map.plan.hint.pull')
              : track.legs.length
                ? t('map.draw.hint.shape')
                : undefined
          }
        >
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
        <FollowSection value={follow} onChange={changeFollow} status={status} />
      </Page>
    </Screen>
  );
}

/** How far a dragged point jumps to a way: a finger's width at the current zoom. */
function snapRadius([, lat]: LngLat): number {
  return tapSnapM(lat, useMapStore.getState().zoom ?? 13);
}
