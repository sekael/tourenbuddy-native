import { haversineMeters } from '@/core/utils/haversine';
import { toursOnMap } from '@/features/map/domain/tours-on-map';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingChains, outingKey, outingSegments } from '@/features/tours/domain/outing';

/** Tours closer than this to the open one's goal share its spot ("+N", the PWA's 25 m). */
const SAME_SPOT_M = 25;

/**
 * What the map shows of the tours (map-integration, the PWA's map): the user's own tours and the
 * friends' tours they are a partner on, thinned to what a narrowed tour list shows; while a tour or
 * an outing is open, only that (D15), unclustered, an outing's stages numbered (D16); each closed
 * outing as a chain of its stages' goals (D8); and the other tours on the open tour's spot.
 */
export type TourScene = {
  /** The tours with a marker on the plain map. */
  mapTours: Tour[];
  /** The open tour, or the open outing's stages in order; empty on the plain map. */
  focus: Tour[];
  /** The open outing's stage ids in order (numbered on their markers); empty otherwise. */
  segmentIds: string[];
  /** The clustered markers: every map tour, none while something is open. */
  clustered: Tour[];
  /** Each closed outing's stage goals, in order. */
  chains: [number, number][][];
  /** The open tour's spot when other tours share it: the tour first, then the others. */
  spot: { at: LngLat; ids: string[] } | null;
};

export function tourScene({
  owned,
  friends,
  selectedId,
  outing,
  listed,
}: {
  owned: Tour[];
  friends: Tour[];
  selectedId: string | null;
  outing: string | null;
  listed: ReadonlySet<string> | null;
}): TourScene {
  const all = [...owned, ...friends];
  const mapTours = toursOnMap(owned, friends, selectedId, listed as Set<string> | null);
  // An open tour shows even when its own marker wouldn't (a friend's tour opened from the list).
  const selected = selectedId ? (all.find((tour) => tour.id === selectedId) ?? null) : null;
  const segments = selected ? [] : outingSegments(all, outing);
  const focus = selected ? [selected] : segments;
  const others = selected
    ? mapTours.filter(
        (tour) =>
          tour.id !== selected.id &&
          haversineMeters([tour.goal.lng, tour.goal.lat], [selected.goal.lng, selected.goal.lat]) <
            SAME_SPOT_M,
      )
    : [];
  return {
    mapTours,
    focus,
    segmentIds: segments.map((tour) => tour.id),
    clustered: focus.length ? [] : mapTours,
    chains: focus.length ? [] : outingChains(mapTours, outing),
    spot:
      selected && others.length
        ? {
            at: [selected.goal.lng, selected.goal.lat],
            ids: [selected.id, ...others.map((tour) => tour.id)],
          }
        : null,
  };
}

/** Each outing stage's place in its outing ("Etappe 2/3"), by tour id. */
export function stagesOf(tours: readonly Tour[]): Map<string, { n: number; total: number }> {
  const stages = new Map<string, { n: number; total: number }>();
  const keys = new Set(tours.map(outingKey).filter((key): key is string => key !== null));
  for (const key of keys) {
    const segments = outingSegments([...tours], key);
    segments.forEach((s, i) => stages.set(s.id, { n: i + 1, total: segments.length }));
  }
  return stages;
}
