import type { TourType } from '@/features/tours/data/models/tour-type';
import { isSameGoal } from '@/features/tours/domain/distance';
import { segmentFinish } from '@/features/tours/domain/outing';

/**
 * Which point a detail marker represents. The goal is rendered separately. `via` is an outing's
 * handover away from every goal: one segment ends where the next starts (design D21).
 */
export type DetailPointKind = 'start' | 'end' | 'via';

interface LngLat {
  lng: number;
  lat: number;
}

/**
 * One resolved start/end marker to render. `draft` selects the lighter preview
 * tone (a not-yet-saved, re-picked location) over the saved full color.
 */
export interface DetailMarker {
  pointKind: DetailPointKind;
  lngLat: LngLat;
  tourTypes: TourType[];
  draft: boolean;
}

/** Per-point inputs: the saved tour coordinate and an optional draft override. */
interface PointInput {
  /** Coordinate stored on the tour (null while creating, or if unset). */
  saved: LngLat | null;
  /**
   * Re-picked, not-yet-saved coordinate. Set ONLY when it genuinely differs from
   * `saved` (the caller diffs first), so its presence always means "being edited".
   */
  draft: LngLat | null;
}

export interface TourDetailMarkersInput {
  /** Types driving marker color; empty → neutral fallback (handled by the layer). */
  tourTypes: TourType[];
  start: PointInput;
  end: PointInput;
}

/**
 * Resolves which start/end markers to render for the open/created tour.
 *
 * Mirrors the goal marker's edit behavior: the SAVED marker always stays
 * visible, and while a point is being edited its DRAFT marker shows ALONGSIDE
 * it (lighter tone, new position) — not in place of it. Cancel drops the draft
 * (its `previewStart`/`previewEnd` clears); save promotes it (the tour's saved
 * coordinate updates and the draft clears). So a point with both a saved and a
 * draft coordinate yields TWO markers.
 *
 * Round-trip dedup, per tone: an end marker is omitted when it coincides
 * (`isSameGoal`) with the start of the same tone — a saved round trip shows one
 * saved marker; a draft round trip shows one draft marker. An end without a
 * start (a connected stage: it ends where the next one starts) shows on its own.
 */
export function tourDetailMarkers(input: TourDetailMarkersInput): DetailMarker[] {
  const effectiveStart = input.start.draft ?? input.start.saved;

  // One tone (saved or draft): the start always shows; the end shows unless it
  // coincides with that tone's anchoring start (round-trip dedup).
  function tone(
    start: LngLat | null,
    end: LngLat | null,
    anchor: LngLat | null,
    draft: boolean,
  ): DetailMarker[] {
    const out: DetailMarker[] = [];
    if (start !== null)
      out.push({ pointKind: 'start', lngLat: start, tourTypes: input.tourTypes, draft });
    if (end !== null && !(anchor !== null && isSameGoal(end, anchor)))
      out.push({ pointKind: 'end', lngLat: end, tourTypes: input.tourTypes, draft });
    return out;
  }

  return [
    ...tone(input.start.saved, input.end.saved, input.start.saved, false),
    ...tone(input.start.draft, input.end.draft, effectiveStart, true),
  ];
}

interface SegmentPoints {
  tourTypes: TourType[];
  goal: LngLat;
  startPoint: LngLat | null;
  endPoint: LngLat | null;
}

/**
 * The whole outing's start/end markers (#338): every segment start and end that is a loose end of
 * the chain — so the first start and last end, plus both sides of a gap (`outingGaps`), each in
 * its segment's colours. Where the chain hands over (a start on the previous segment's finish) the
 * point is a `via` ring in the next segment's colours, and the previous end is not drawn again.
 * Nothing is drawn on a goal (its marker stands there) or on a marker already placed (a round
 * outing ends where it began).
 */
export function outingDetailMarkers(segments: readonly SegmentPoints[]): DetailMarker[] {
  const out: DetailMarker[] = [];
  const taken = (p: LngLat) =>
    segments.some((s) => isSameGoal(p, s.goal)) || out.some((m) => isSameGoal(p, m.lngLat));
  segments.forEach((s, i) => {
    const prev = segments[i - 1];
    const next = segments[i + 1];
    if (s.startPoint && !taken(s.startPoint)) {
      const handover = !!prev && isSameGoal(s.startPoint, segmentFinish(prev));
      out.push({
        pointKind: handover ? 'via' : 'start',
        lngLat: s.startPoint,
        tourTypes: s.tourTypes,
        draft: false,
      });
    }
    if (
      s.endPoint &&
      !(next?.startPoint && isSameGoal(s.endPoint, next.startPoint)) &&
      !taken(s.endPoint)
    )
      out.push({ pointKind: 'end', lngLat: s.endPoint, tourTypes: s.tourTypes, draft: false });
  });
  return out;
}

interface DraftStagePoints {
  tourTypes: TourType[];
  goal: LngLat | null;
  startPoint: LngLat | null;
  endPoint: LngLat | null;
}

/**
 * The start / end markers of a tour being created, stage by stage (map-first-tour-creation D7):
 * like an outing's, in the draft tone. A stage the route step has no goal for yet shows its
 * points as they are.
 */
export function draftStageMarkers(stages: readonly DraftStagePoints[]): DetailMarker[] {
  const placed = stages.filter((s): s is DraftStagePoints & { goal: LngLat } => s.goal !== null);
  const out = outingDetailMarkers(placed).map((m) => ({ ...m, draft: true }));
  // Not on a goal or a marker already there: the next day starting at the last one's goal.
  const free = (p: LngLat) =>
    !placed.some((s) => isSameGoal(p, s.goal)) && !out.some((m) => isSameGoal(p, m.lngLat));
  for (const s of stages.filter((s) => s.goal === null)) {
    if (s.startPoint && free(s.startPoint))
      out.push({ pointKind: 'start', lngLat: s.startPoint, tourTypes: s.tourTypes, draft: true });
    if (s.endPoint && free(s.endPoint))
      out.push({ pointKind: 'end', lngLat: s.endPoint, tourTypes: s.tourTypes, draft: true });
  }
  return out;
}
