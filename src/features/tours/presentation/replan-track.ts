import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isOnline } from '@/core/offline/online';
import {
  legsAlong,
  trackFromLine,
  trackLine,
  withWayBack,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { wayFollow, type Follow, type Follows, type Way } from '@/features/map/domain/snap-network';
import { legEnd, legRouters, type LegRouter } from '@/features/map/presentation/leg-router';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import { gpxFromLine } from '@/features/tours/data/services/gpx-writer';
import { densify, getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';
import { trackLines } from '@/features/tours/domain/route-metrics';

import { useTourDraftStore } from './stores/tour-draft-store';

/** A flight shorter than this needs no word: the walked distance is near enough the line's. */
export const FLOWN_NOTE_M = 50;

/** A line as the tour's GPX, with the terrain's heights when online. */
export async function gpxOf(line: LngLat[], name: string): Promise<string> {
  const profiled = isOnline() ? await getTrackProfile(line).catch(() => null) : null;
  return gpxFromLine(profiled?.line ?? densify(line), profiled?.heights ?? null, name);
}

/** The tour's track: one waiting in the form, else the saved GPX (unless removed); null without. */
export async function savedLine(): Promise<LngLat[] | null> {
  const { track, gpxRemoved, draft, tourId } = useTourDraftStore.getState();
  if (track) return track.line;
  if (gpxRemoved || !draft.gpxFilepath || !tourId) return null;
  const geojson = await loadGpxTrack({ id: tourId, gpxFilepath: draft.gpxFilepath }).catch(
    () => null,
  );
  return geojson ? (trackLines(geojson).flat() as LngLat[]) : null;
}

/**
 * "Round trip" (tour-form-extended "Round Trip Tour shortcut", as the route step's): the end at
 * the start, and the track, if any, back the same way to it, exactly, as drawing's "To start".
 * The end comes first, so the form's row is gone before a second tap. `drawn`: a drawn track's
 * label.
 */
export async function makeRoundTrip(drawn: string): Promise<void> {
  const store = useTourDraftStore.getState();
  const { draft, route } = store;
  if (!draft.startPoint) return;
  if (route?.points.start) {
    store.setRoute({
      points: { ...route.points, end: route.points.start },
      track: route.track && withWayBack(route.track),
      backSame: true,
    });
  } else {
    store.update({
      endPoint: { ...draft.startPoint },
      endPointName: draft.startPointName,
      endPointElevation: draft.startPointElevation,
    });
  }
  const line = await savedLine();
  if (!line || line.length < 2) return;
  const pending = useTourDraftStore.getState().track;
  const back = withWayBack(pending?.drawing ?? trackFromLine(line));
  const full = trackLine(back);
  store.setTrack({
    ...pending,
    text: gpxFromLine(full, null, draft.name?.trim() || drawn),
    label: pending?.drawing ? pending.label : drawn,
    line: full,
    drawing: back,
  });
}

/**
 * The drawing with each way that followed otherwise when planned routed as `now` says: a flown way
 * straight, another along its new network; a way that stays keeps its shape. A round trip's way
 * back retraces its way up as that is now (unless flown). Null when nothing
 * changed, or the drawing has no goal to tell its ways apart, or can't be cut at its points.
 */
export async function replanned(
  drawing: DrawnTrack,
  line: readonly LngLat[],
  before: Follows,
  now: Follows,
  routerFor: (follow: Follow) => LegRouter,
): Promise<DrawnTrack | null> {
  const { points, goal } = drawing;
  if (goal == null || (before.up === now.up && before.down === now.down)) return null;
  const legs = drawing.legs.length === points.length - 1 ? drawing.legs : legsAlong(line, points);
  if (!legs) return null;
  const next: LngLat[][] = [];
  const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];
  for (const [i, leg] of legs.entries()) {
    const way: Way = i < goal ? 'up' : 'down';
    // A leg back between the points of a leg up (a round trip) retraces it, unless flown.
    const up =
      way === 'down' && now.down !== 'straight'
        ? next.findIndex(
            (_, j) => same(points[j]!, points[i + 1]!) && same(points[j + 1]!, points[i]!),
          )
        : -1;
    if (up >= 0) {
      next.push(next[up]!.slice().reverse());
      continue;
    }
    if (before[way] === now[way]) {
      next.push(leg);
      continue;
    }
    const [a, b] = [points[i]!, points[i + 1]!];
    const ends = [legEnd(i, points.length, goal), legEnd(i + 1, points.length, goal)] as const;
    next.push(
      await routerFor(now[way])
        .between(a, b, ends)
        .catch(() => [a, b]),
    );
  }
  return { points, legs: next, goal };
}

/**
 * A track planned on the map follows its ways as the activities were then (activity-legs). The
 * form changes them — a hike becomes a hike & fly — so the ways that now follow otherwise are
 * routed anew, the way down flown straight to the landing. A file's or a saved tour's track stays
 * as it is. True while it routes: the form's Save waits.
 */
export function useReplannedTrack(): boolean {
  const { t } = useTranslation();
  const track = useTourDraftStore((s) => s.track);
  const draft = useTourDraftStore((s) => s.draft);
  const overlays = useMapStore((s) => s.overlays);
  const [routerFor] = useState(() => legRouters(64));
  const up = wayFollow(overlays, draft, 'up');
  const down = wayFollow(overlays, draft, 'down');
  const before = track?.follows;
  // Routing until the track follows what the activities say: it is set with them when done.
  const stale = !!track?.drawing && !!before && (before.up !== up || before.down !== down);

  useEffect(() => {
    const drawing = track?.drawing;
    if (!stale || !track || !drawing || !before) return;
    let alive = true;
    void (async () => {
      const now = { up, down };
      const next = await replanned(drawing, track.line, before, now, routerFor);
      const line = next ? trackLine(next) : null;
      const name = useTourDraftStore.getState().draft.name?.trim() || t('tours.form.gpxDrawn');
      const text = line ? await gpxOf(line, name) : null;
      if (!alive) return;
      // Settled either way: a drawing that can't be cut keeps its line.
      useTourDraftStore
        .getState()
        .setTrack(
          next && line && text
            ? { ...track, text, line, drawing: next, follows: now }
            : { ...track, follows: now },
        );
    })();
    return () => {
      alive = false;
    };
  }, [stale, track, before, up, down, routerFor, t]);

  return stale;
}
