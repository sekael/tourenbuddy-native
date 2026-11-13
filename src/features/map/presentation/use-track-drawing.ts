import { useEffect, useMemo, useRef, useState } from 'react';

import { useLatest } from '@/core/use-latest';

import { createLogger } from '@/core/logging/logger';
import { haversineMeters } from '@/core/utils/haversine';
import {
  EMPTY_TRACK,
  lineLength,
  trackLine,
  withWayBack,
  type DrawnTrack,
} from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { Follow } from '@/features/map/domain/snap-network';
import {
  getTrackProfile,
  type ProfiledLine,
} from '@/features/tours/data/services/swisstopo-profile-service';
import { trackMetrics, type RouteMetrics } from '@/features/tours/domain/route-metrics';

import { createLegRouter, legEnd, straightRouter, type NetworkIssue } from './leg-router';

const log = createLogger('TrackDrawing');

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

/** A route's stops joined straight, until the ways between them load. */
function straightened(seed: DrawnTrack): DrawnTrack {
  if (seed.legs.length > 0 || seed.points.length < 2) return seed;
  const { points, goal } = seed;
  return { points, legs: points.slice(1).map((p, i) => [points[i]!, p]), goal };
}

/**
 * A track being drawn (track-drawing), ported from the PWA: points set on the map, each joined to
 * the one before along the network, undo and redo, back to the start, live numbers from the
 * terrain profile. Steps run one after another, so the history only holds finished legs; a tap's
 * point shows at once (`queued`) while its leg loads. A route's goal stays its point throughout.
 */
export function useTrackDrawing(seed: DrawnTrack | null, follow: Follow) {
  const router = useMemo(
    () => (follow === 'straight' ? straightRouter : createLegRouter({ network: () => follow })),
    [follow],
  );
  // A route's stops show joined straight at once; the effect below routes them along the ways.
  const [track, setTrack] = useState<DrawnTrack>(() => (seed ? straightened(seed) : EMPTY_TRACK));
  const [past, setPast] = useState<DrawnTrack[]>([]);
  const [future, setFuture] = useState<DrawnTrack[]>([]);
  const [queued, setQueued] = useState<LngLat[]>([]);
  const [running, setRunning] = useState(0);
  const [issue, setIssue] = useState<NetworkIssue>(null);
  const [profile, setProfile] = useState<{ for: DrawnTrack; result: ProfiledLine } | null>(null);
  const trackRef = useLatest(track);
  const chain = useRef(Promise.resolve());

  function enqueue(step: () => Promise<void>) {
    setRunning((n) => n + 1);
    chain.current = chain.current
      .then(step)
      .catch((error) => log.warn('Drawing step failed', error))
      .finally(() => setRunning((n) => n - 1));
  }

  function commit(next: DrawnTrack) {
    // Read now: the updater runs later, when the ref already holds `next`.
    const before = trackRef.current;
    setPast((p) => [...p, before]);
    setFuture([]);
    trackRef.current = next;
    setTrack(next);
  }

  // A route's stops, joined along the ways as the drawing opens: where it starts, not a step.
  useEffect(() => {
    if (!seed || seed.legs.length > 0 || seed.points.length < 2) return;
    const { points, goal } = seed;
    enqueue(async () => {
      const legs: LngLat[][] = [];
      for (let i = 1; i < points.length; i++) {
        legs.push(
          await router.between(points[i - 1]!, points[i]!, [
            legEnd(i - 1, points.length, goal),
            legEnd(i, points.length, goal),
          ]),
        );
      }
      setIssue(router.issue());
      trackRef.current = { points, legs, goal };
      setTrack(trackRef.current);
    });
    // Once, for the seed it opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live numbers: the terrain profile of the track as it is, 300 ms after the last change.
  useEffect(() => {
    const line = trackLine(track);
    if (line.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      void getTrackProfile(line)
        .catch(() => null)
        .then((result) => {
          if (alive && result) setProfile({ for: track, result });
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [track]);

  const busy = running > 0;
  const line = trackLine(track);
  const current = profile?.for === track ? profile.result : null;
  const { points } = track;

  return {
    track,
    queued,
    busy,
    issue,
    metrics: profileMetrics(line, current),
    /** The terrain profile of the track as it is, once it arrived (none offline). */
    profile: current,
    closed: points.length > 1 && haversineMeters(points[0]!, points.at(-1)!) < 1,
    canUndo: !busy && past.length > 0,
    canRedo: !busy && future.length > 0,
    add: (point: LngLat, radiusM: number) => {
      setQueued((q) => [...q, point]);
      enqueue(async () => {
        const { points: pts, legs, goal } = trackRef.current;
        const { to, line: leg } = await router.resolve(pts.at(-1) ?? null, point, radiusM);
        setIssue(router.issue());
        setQueued((q) => q.filter((x) => x !== point));
        commit({ points: [...pts, to], legs: leg ? [...legs, leg] : legs, goal });
      });
    },
    /** The same way back to the start, exactly: an out-and-back in one step. */
    returnToStart: () => {
      if (busy || trackRef.current.legs.length === 0) return;
      commit(withWayBack(trackRef.current));
    },
    undo: () => {
      if (busy || past.length === 0) return;
      const current = trackRef.current;
      setFuture((f) => [current, ...f]);
      trackRef.current = past.at(-1)!;
      setTrack(trackRef.current);
      setPast((p) => p.slice(0, -1));
    },
    redo: () => {
      if (busy || future.length === 0) return;
      const current = trackRef.current;
      setPast((p) => [...p, current]);
      trackRef.current = future[0]!;
      setTrack(trackRef.current);
      setFuture((f) => f.slice(1));
    },
    clear: () => commit(EMPTY_TRACK),
    /** Point `index` dragged to `to` (on the nearest way): its legs either side follow again. */
    move: (index: number, to: LngLat, radiusM: number) => {
      enqueue(async () => {
        const { points: pts, legs, goal } = trackRef.current;
        if (!pts[index]) return;
        const at = (await router.resolve(null, to, radiusM)).to;
        const next = pts.map((p, i) => (i === index ? at : p));
        const nextLegs = [...legs];
        const end = (i: number) => legEnd(i, next.length, goal);
        if (index > 0)
          nextLegs[index - 1] = await router.between(next[index - 1]!, at, [
            end(index - 1),
            end(index),
          ]);
        if (index < next.length - 1)
          nextLegs[index] = await router.between(at, next[index + 1]!, [
            end(index),
            end(index + 1),
          ]);
        setIssue(router.issue());
        commit({ points: next, legs: nextLegs, goal });
      });
    },
    /** A point pulled out of leg `leg` to `to`: the leg goes through it, both halves along the ways. */
    pull: (leg: number, to: LngLat, radiusM: number) => {
      enqueue(async () => {
        const { points: pts, legs, goal } = trackRef.current;
        if (!pts[leg + 1]) return;
        const at = (await router.resolve(null, to, radiusM)).to;
        const next = [...pts.slice(0, leg + 1), at, ...pts.slice(leg + 1)];
        const g = goal != null && goal > leg ? goal + 1 : goal;
        const end = (i: number) => legEnd(i, next.length, g);
        const a = await router.between(next[leg]!, at, [end(leg), 'via']);
        const b = await router.between(at, next[leg + 2]!, ['via', end(leg + 2)]);
        setIssue(router.issue());
        commit({
          points: next,
          legs: [...legs.slice(0, leg), a, b, ...legs.slice(leg + 1)],
          goal: g,
        });
      });
    },
    /** Point `index` taken out (never the goal): its neighbours join along the ways. */
    drop: (index: number) => {
      enqueue(async () => {
        const { points: pts, legs, goal } = trackRef.current;
        if (!pts[index] || index === goal) return;
        const next = pts.filter((_, i) => i !== index);
        const g = goal != null && goal > index ? goal - 1 : goal;
        let nextLegs: LngLat[][];
        if (index === 0) nextLegs = legs.slice(1);
        else if (index === pts.length - 1) nextLegs = legs.slice(0, -1);
        else {
          const end = (i: number) => legEnd(i, next.length, g);
          const joined = await router.between(next[index - 1]!, next[index]!, [
            end(index - 1),
            end(index),
          ]);
          nextLegs = [...legs.slice(0, index - 1), joined, ...legs.slice(index + 1)];
        }
        setIssue(router.issue());
        commit({ points: next, legs: nextLegs, goal: g });
      });
    },
  };
}
