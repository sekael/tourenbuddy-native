import { useRef, useState } from 'react';
import { type LegTiming, resolve } from './leg-router';
import { type DrawnTrack, EMPTY_TRACK, trackLine } from './vendor/drawn-track';
import type { SnapNetwork } from './vendor/snap-network';
import type { LngLat } from './vendor/trail';

/**
 * The PWA's tap-to-add drawing (use-track-drawing.ts), trimmed to what S3 measures: add, drag,
 * drop, undo. Steps run one after another, like the Vue `enqueue` chain.
 */
export function useTrackDrawing(network: () => SnapNetwork | null, onTiming: (t: LegTiming) => void) {
  const [track, setTrack] = useState<DrawnTrack>(EMPTY_TRACK);
  const [dragging, setDragging] = useState<{ index: number; point: LngLat } | null>(null);
  const current = useRef(track);
  const chain = useRef(Promise.resolve());

  const commit = (next: DrawnTrack) => {
    current.current = next;
    setTrack(next);
  };
  const enqueue = (step: () => Promise<void>) => {
    chain.current = chain.current.then(step).catch(err => console.warn('drawing step failed', err));
  };
  const leg = async (from: LngLat | null, to: LngLat, radiusM: number) => {
    const result = await resolve(network(), SKI_TEMPLATE, from, to, radiusM);
    if (result.timing) onTiming(result.timing);
    return result;
  };

  function add(point: LngLat, radiusM: number) {
    enqueue(async () => {
      const { points, legs } = current.current;
      const { to, line } = await leg(points.at(-1) ?? null, point, radiusM);
      commit({ points: [...points, to], legs: line ? [...legs, line] : legs });
    });
  }

  function drop(index: number, point: LngLat, radiusM: number) {
    enqueue(async () => {
      const { points, legs } = current.current;
      const before = await leg(points[index - 1] ?? null, point, radiusM);
      const next = points[index + 1];
      const after = next && (await leg(before.to, next, radiusM));
      setDragging(null);
      commit({
        points: points.map((p, i) => (i === index ? before.to : p)),
        legs: legs.map((l, i) => {
          if (i === index - 1) return before.line!;
          return i === index && after?.line ? [...after.line.slice(0, -1), next!] : l;
        }),
      });
    });
  }

  function undo() {
    enqueue(async () => {
      const { points, legs } = current.current;
      commit({ points: points.slice(0, -1), legs: legs.slice(0, Math.max(0, points.length - 2)) });
    });
  }

  // While a point is dragged its two legs go straight; they follow the ways again on drop.
  const shown: DrawnTrack = dragging
    ? {
        points: track.points.map((p, i) => (i === dragging.index ? dragging.point : p)),
        legs: track.legs.map((l, i) =>
          i === dragging.index - 1 ? [l[0]!, dragging.point] : i === dragging.index ? [dragging.point, l.at(-1)!] : l,
        ),
      }
    : track;

  return {
    points: shown.points,
    line: trackLine(shown),
    add,
    drag: (index: number, point: LngLat) => setDragging({ index, point }),
    drop,
    undo,
    clear: () => enqueue(async () => commit(EMPTY_TRACK)),
  };
}

// ponytail: fixed dataset version; the PWA reads it from the map source / TileJSON (`skiTilesTemplate`).
const SKI_TEMPLATE = 'https://tourenbuddy-data.pages.dev/ski-routes/2025-12-15T091422/{z}/{x}/{y}.pbf';
