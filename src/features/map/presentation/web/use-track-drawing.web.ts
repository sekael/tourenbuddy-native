// Ported from the PWA's features/map/presentation/composables/use-track-drawing.ts (port-pwa-web).
import { useEffect, useRef, useState } from 'react';

import { createLogger } from '@/core/logging/logger';
import { haversineMeters } from '@/core/utils/haversine';
import { useReactive } from '@/core/web/use-reactive.web';
import {
  EMPTY_TRACK,
  lineLength,
  pointAlong,
  trackLine,
  withWayBack,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { SnapNetwork } from '@/features/map/domain/snap-network';
import {
  getTrackProfile,
  type ProfiledLine,
} from '@/features/tours/data/services/swisstopo-profile-service';
import { trackMetrics, type RouteMetrics } from '@/features/tours/domain/route-metrics';

import { legEnd, useLegRouter } from './use-leg-router.web';

export type { NetworkIssue } from './use-leg-router.web';

const logger = createLogger('TrackDrawing');

/** A line's climb, descent and length, the heights from its terrain profile (none: unknown yet). */
export function profileMetrics(
  line: readonly LngLat[],
  profile: ProfiledLine | null,
): RouteMetrics {
  const distance = Math.round(lineLength(line));
  if (!profile) return { distance, ascent: null, descent: null };
  const coordinates = profile.line.map(([lng, lat], i) =>
    profile.heights[i] == null ? [lng, lat] : [lng, lat, profile.heights[i]!],
  );
  const { ascent, descent } = trackMetrics({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }],
  });
  return { distance, ascent, descent };
}

interface Options {
  /** The track to go on from; points without legs are stops to join along the ways first (a route's start, goal and end). */
  seed: DrawnTrack | null;
  /** What the line follows first, then the base map's ways; null = those ways alone. */
  network: () => SnapNetwork | null;
  /** URL template of the current ski-route tiles. */
  skiTemplate: () => Promise<string | null>;
}

/**
 * A track being drawn: points set on the map, each joined to the one before along the network
 * (A* over the ways in the tiles around them), with undo/redo and live numbers from the terrain
 * profile. Steps run one after another, so the history only ever holds finished legs; a tap's
 * point shows at once (`queued`) while its leg loads. A route's goal (`DrawnTrack.goal`) stays
 * the same point through every step. The returned object is the same on every render and reads
 * live, so map handlers bound once keep working (callers opt out of the React Compiler).
 */
export function useTrackDrawing(options: Options) {
  // A route's stops, joined along the ways as the drawing opens: where it starts, not a step to undo.
  const [stops] = useState(() =>
    options.seed && options.seed.legs.length === 0 && options.seed.points.length > 1
      ? options.seed
      : null,
  );
  const s = useReactive(() => ({
    track: stops
      ? {
          points: stops.points,
          legs: stops.points.slice(1).map((p, i) => [stops.points[i]!, p]),
          goal: stops.goal,
        }
      : (options.seed ?? EMPTY_TRACK),
    past: [] as DrawnTrack[],
    future: [] as DrawnTrack[],
    /** Taps waiting for their leg. */
    queued: [] as LngLat[],
    running: 0,
    /**
     * A point under the finger, shown with straight legs until it is let go: an existing point
     * (`index`), or a new one pulled out of leg `index` by its middle handle (`insert`).
     */
    dragging: null as { index: number; point: LngLat; insert: boolean } | null,
    profile: null as { for: DrawnTrack; result: ProfiledLine } | null,
  }));
  const router = useLegRouter(options);
  const chain = useRef(Promise.resolve());

  const [api] = useState(() => {
    const { resolve, between } = router;
    const busy = () => s.running > 0;

    function enqueue(step: () => Promise<void>) {
      s.running++;
      chain.current = chain.current
        .then(step)
        .catch((err) => logger.warn('Drawing step failed', err))
        .finally(() => s.running--);
    }

    function commit(next: DrawnTrack) {
      s.past = [...s.past, s.track];
      s.future = [];
      s.track = next;
    }

    /** What the map shows: the track, with a dragged point on straight legs (one object per state). */
    let cache: { track: DrawnTrack; dragging: typeof s.dragging; shown: DrawnTrack } | null = null;
    function shown(): DrawnTrack {
      if (cache?.track !== s.track || cache.dragging !== s.dragging)
        cache = { track: s.track, dragging: s.dragging, shown: computeShown() };
      return cache.shown;
    }
    function computeShown(): DrawnTrack {
      const d = s.dragging;
      const { points, legs, goal } = s.track;
      if (!d) return s.track;
      if (d.insert) {
        return {
          points: [...points.slice(0, d.index + 1), d.point, ...points.slice(d.index + 1)],
          legs: [
            ...legs.slice(0, d.index),
            [points[d.index]!, d.point],
            [d.point, points[d.index + 1]!],
            ...legs.slice(d.index + 1),
          ],
          goal: goal != null && goal > d.index ? goal + 1 : goal,
        };
      }
      return {
        points: points.map((p, i) => (i === d.index ? d.point : p)),
        legs: legs.map((leg, i) =>
          i === d.index - 1
            ? [points[i]!, d.point]
            : i === d.index
              ? [d.point, points[i + 1]!]
              : leg,
        ),
        goal,
      };
    }

    /** The profile of the track as it is now; null while it loads, or offline. */
    const currentProfile = () => (s.profile?.for === s.track ? s.profile.result : null);

    return {
      get track() {
        return s.track;
      },
      get queued() {
        return s.queued;
      },
      get shown() {
        return shown();
      },
      /** Where each leg's middle handle sits: halfway along it. None while a point is held. */
      get handles() {
        return s.dragging ? [] : shown().legs.map((leg) => pointAlong(leg, 0.5));
      },
      /** The line already ends where it started. */
      get closed() {
        const { points } = s.track;
        return points.length > 1 && haversineMeters(points[0]!, points.at(-1)!) < 1;
      },
      get busy() {
        return busy();
      },
      get canUndo() {
        return !busy() && s.past.length > 0;
      },
      get canRedo() {
        return !busy() && s.future.length > 0;
      },
      get profile() {
        return currentProfile();
      },
      get metrics() {
        return profileMetrics(trackLine(s.track), currentProfile());
      },
      issue: router.issue,

      /** Joins a route's stops along the ways, once, as the drawing opens. */
      start() {
        if (!stops) return;
        const { points, goal } = stops;
        enqueue(async () => {
          const legs: LngLat[][] = [];
          for (let i = 1; i < points.length; i++)
            legs.push(
              await between(points[i - 1]!, points[i]!, [
                legEnd(i - 1, points.length, goal),
                legEnd(i, points.length, goal),
              ]),
            );
          s.track = { points, legs, goal };
        });
      },

      add(point: LngLat, radiusM: number) {
        s.queued = [...s.queued, point];
        enqueue(async () => {
          const { points, legs } = s.track;
          const { to, line } = await resolve(points.at(-1) ?? null, point, radiusM);
          s.queued = s.queued.filter((q) => q !== point);
          commit({
            points: [...points, to],
            legs: line ? [...legs, line] : legs,
            goal: s.track.goal,
          });
        });
      },

      drag(index: number, point: LngLat | null, insert = false) {
        s.dragging = point && { index, point, insert };
      },

      /** Let go of a dragged point: it lands on the ways, and both its legs follow them again. */
      drop(index: number, point: LngLat, radiusM: number) {
        enqueue(async () => {
          const { points, legs, goal } = s.track;
          const before = await resolve(points[index - 1] ?? null, point, radiusM);
          const next = points[index + 1];
          const after = next && (await resolve(before.to, next, radiusM));
          s.dragging = null;
          commit({
            points: points.map((p, i) => (i === index ? before.to : p)),
            legs: legs.map((leg, i) => {
              if (i === index - 1) return before.line!;
              // Its far end stays where it was set.
              return i === index && after?.line ? [...after.line.slice(0, -1), next!] : leg;
            }),
            goal,
          });
        });
      },

      /** Let go of a point pulled out of leg `leg`: it becomes a point between the leg's two, both new legs following the ways. */
      dropInsert(leg: number, point: LngLat, radiusM: number) {
        enqueue(async () => {
          const { points, legs, goal } = s.track;
          const [a, b] = [points[leg]!, points[leg + 1]!];
          const first = await resolve(a, point, radiusM);
          const second = await resolve(first.to, b, radiusM);
          s.dragging = null;
          commit({
            points: [...points.slice(0, leg + 1), first.to, ...points.slice(leg + 1)],
            // The far end stays where it was set.
            legs: [
              ...legs.slice(0, leg),
              first.line!,
              [...second.line!.slice(0, -1), b],
              ...legs.slice(leg + 1),
            ],
            goal: goal != null && goal > leg ? goal + 1 : goal,
          });
        });
      },

      /** The same way back to the start, exactly: an out-and-back in one step. */
      returnToStart() {
        if (busy() || s.track.legs.length === 0) return;
        commit(withWayBack(s.track));
      },

      undo() {
        if (busy() || s.past.length === 0) return;
        s.future = [s.track, ...s.future];
        s.track = s.past.at(-1)!;
        s.past = s.past.slice(0, -1);
      },

      redo() {
        if (busy() || s.future.length === 0) return;
        s.past = [...s.past, s.track];
        s.track = s.future[0]!;
        s.future = s.future.slice(1);
      },
    };
  });
  api.issue = router.issue;

  // Live numbers: the terrain profile once the track rests for 300 ms.
  useEffect(() => {
    const current = s.track;
    const timer = setTimeout(() => {
      void getTrackProfile(trackLine(current)).then((result) => {
        if (result && s.track === current) s.profile = { for: current, result };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [s.track]);

  return api;
}
