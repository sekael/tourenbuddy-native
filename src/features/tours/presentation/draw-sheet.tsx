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
  goalShare,
  lineLength,
  routeStops,
  trackFromLine,
  trackLine,
  withGoal,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { wayFollow, type Follow, type Way } from '@/features/map/domain/snap-network';
import { routeBands, routeShares } from '@/features/map/domain/track-bands';
import { tapSnapM } from '@/features/map/presentation/leg-router';
import { useMapStore, type HandleTarget } from '@/features/map/presentation/stores/map-store';
import { ElevationProfile } from '@/features/map/presentation/elevation-profile';
import { FollowSection, followStatus } from '@/features/map/presentation/follow-section';
import { profileMetrics, useTrackDrawing } from '@/features/map/presentation/use-track-drawing';
import { landsByAir } from '@/features/tours/domain/legs';
import { tourMinutes } from '@/features/tours/domain/route-metrics';
import { usePace } from '@/features/user/presentation/stores/user-profile-store';

import { FLOWN_NOTE_M, gpxOf } from './replan-track';
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
  const { draft, goal: tourGoal } = useTourDraftStore.getState();
  /** The legs follow the ways (the PWA's switch); off, straight lines between the points. */
  const [following, setFollowing] = useState(true);
  /** Each way follows its own activities' network, a flown way straight (activity-legs). */
  const ways: Record<Way, Follow> = {
    up: following ? wayFollow(overlays, draft, 'up') : 'straight',
    down: following ? wayFollow(overlays, draft, 'down') : 'straight',
  };
  const [seed] = useState(seedTrack);
  const drawing = useTrackDrawing(seed, ways);
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
    const line = trackLine(track);
    // The line wears its ways' colours, the way down's from the goal on, as the saved tour will.
    const at = goalShare(track, tourGoal);
    useMapStore.setState({
      previewLines: {
        type: 'FeatureCollection',
        features:
          line.length > 1
            ? routeBands(line, draft, at).map((band) => ({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: band.coordinates },
                properties: { color: band.color, width: 4, casing: true },
              }))
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
  }, [track, queued, draft, tourGoal, drawingRef, picked]);

  // A flown way counts its height change alone, as the saved tour will.
  const goalAt = track.goal != null ? track.points[track.goal] : undefined;
  const metrics = profileMetrics(trackLine(track), drawing.profile, {
    ...draft,
    goal: goalAt && { lng: goalAt[0], lat: goalAt[1] },
  });
  const minutes = tourMinutes(metrics, draft, pace);
  /** The flight's share of the line (and its profile), which the walked distance leaves out. */
  const flown = metrics.distance !== null ? lineLength(trackLine(track)) - metrics.distance : 0;
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
      const name = store.draft.name?.trim() || t('tours.form.gpxDrawn');
      store.setTrack({
        text: await gpxOf(line, name),
        label: t('tours.form.gpxDrawn'),
        line,
        drawing: track,
        // The form routes a way anew when its activities change what it follows.
        follows: following ? ways : null,
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

  const status = followStatus(t, {
    following,
    up: ways.up,
    down: track.goal != null && track.goal < track.points.length - 1 ? ways.down : null,
    unavailable: drawing.issue === 'unavailable',
  });

  return (
    <Screen>
      <Page
        title={t('map.draw.title')}
        header={
          drawing.profile && track.points.length > 1 ? (
            <ElevationProfile
              line={drawing.profile.line}
              heights={drawing.profile.heights}
              bands={routeShares(draft, goalShare(track, tourGoal))}
            />
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
                : flown > FLOWN_NOTE_M
                  ? t('map.plan.flightApart', { distance: formatDistance(flown) })
                  : undefined
            }
            icon="route"
          />
          {/* The same way back can't be flown: a flight down ends at its landing (as the form). */}
          {!drawing.closed && track.legs.length > 0 && !landsByAir(draft) ? (
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
        <FollowSection value={following} onChange={setFollowing} status={status} />
      </Page>
    </Screen>
  );
}

/** How far a dragged point jumps to a way: a finger's width at the current zoom. */
function snapRadius([, lat]: LngLat): number {
  return tapSnapM(lat, useMapStore.getState().zoom ?? 13);
}
