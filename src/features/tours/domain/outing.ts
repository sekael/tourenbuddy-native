import type { TourOuting } from '@/features/tours/data/models/tour-schema';
import type { Tour, TourDraft } from '@/features/tours/domain/entities/tour';
import { isSameGoal } from '@/features/tours/domain/distance';

/**
 * Outings made of segments (#338). An outing is the owner's tours sharing an `outing.id`;
 * membership, name and order live on each tour (design D11).
 */

/**
 * Owner + outing id (D14): a friend can read an outing id and copy it onto their own tour,
 * so the id alone must never pull another user's tour into the outing.
 */
export function outingKey(tour: Pick<Tour, 'userId' | 'outing'>): string | null {
  return tour.outing ? `${tour.userId}/${tour.outing.id}` : null;
}

/** Position, then id — a stable order even when two offline edits picked the same position (D13). */
function bySegmentOrder(a: Tour, b: Tour): number {
  return a.outing!.position - b.outing!.position || a.id.localeCompare(b.id);
}

/**
 * The segments of the outing `key` among `tours`, in order. Fewer than two visible segments is
 * no outing (D14) — a lone segment presents as a plain tour — so that case returns [].
 */
export function outingSegments(tours: Tour[], key: string | null): Tour[] {
  if (!key) return [];
  const segments = tours.filter((t) => outingKey(t) === key).sort(bySegmentOrder);
  return segments.length >= 2 ? segments : [];
}

/**
 * The goal chain of every outing among `tours` except the open one (`openKey`, which shows its
 * tracks instead): one `[lng, lat]` line per outing with two or more segments, in segment order.
 */
export function outingChains(tours: Tour[], openKey: string | null): [number, number][][] {
  const keys = new Set(tours.map(outingKey).filter((k) => k !== null && k !== openKey));
  return [...keys]
    .map((key) =>
      outingSegments(tours, key).map((s) => [s.goal.lng, s.goal.lat] as [number, number]),
    )
    .filter((chain) => chain.length >= 2);
}

interface LngLat {
  lng: number;
  lat: number;
}
type SegmentPoints = Pick<Tour, 'goal' | 'startPoint' | 'endPoint'>;

/** Where a segment finishes: its end, else its goal. */
export function segmentFinish(segment: SegmentPoints): LngLat {
  return segment.endPoint ?? segment.goal;
}

/**
 * Segment `index` starts away from where segment `index - 1` finishes — a reorder or an edit left
 * the chain broken. Shown, never fixed: a transfer by train or lift is a real outing too.
 * A segment without a start has no gap (nothing to compare).
 */
export function outingGaps(
  segments: readonly SegmentPoints[],
): { index: number; from: LngLat; to: LngLat }[] {
  return segments.slice(1).flatMap((s, i) => {
    const from = segmentFinish(segments[i]!);
    return s.startPoint && !isSameGoal(from, s.startPoint)
      ? [{ index: i + 1, from, to: s.startPoint }]
      : [];
  });
}

/** `segments` with the one at `from` moved to `to`. */
export function movedSegment<T>(segments: readonly T[], from: number, to: number): T[] {
  const order = [...segments];
  order.splice(to, 0, ...order.splice(from, 1));
  return order;
}

/** The outing's own name, else its first segment's name. */
export function outingDisplayName(segments: Tour[]): string | null {
  return segments[0]?.outing?.name ?? segments[0]?.name ?? null;
}

/** First day … last day across the segments (null when none is dated). */
export function outingSpan(segments: Tour[]): { start: Date; end: Date } | null {
  const days = segments.flatMap((s) =>
    [s.plannedDate, s.endDate].filter((d): d is Date => d != null),
  );
  if (days.length === 0) return null;
  const times = days.map((d) => d.getTime());
  return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) };
}

const DAY_MS = 86_400_000;
/** Calendar day number — rounding absorbs a stored UTC midnight vs. a local one. */
const dayNumber = (d: Date) => Math.round(d.getTime() / DAY_MS);

/** Calendar days from the first to the last day of `span`, both counted. */
export function spanDays(span: { start: Date; end: Date }): number {
  return dayNumber(span.end) - dayNumber(span.start) + 1;
}

/**
 * Indexes of the segments a night precedes (D20): each starts on a later day than the previous
 * segment's last day. Undated segments never mark a night.
 */
export function outingNights(
  segments: readonly Pick<Tour, 'plannedDate' | 'endDate'>[],
): Set<number> {
  return new Set(
    segments.flatMap((s, i) => {
      const prev = segments[i - 1];
      const prevLast = prev && (prev.endDate ?? prev.plannedDate);
      return prevLast && s.plannedDate && dayNumber(s.plannedDate) > dayNumber(prevLast) ? [i] : [];
    }),
  );
}

/**
 * Indexes of segments dated before the previous segment's first day: the order and the dates
 * disagree (a reorder, or a date edit). Shown, like a gap — which one is wrong is the owner's call.
 */
export function outingDateConflicts(segments: readonly Pick<Tour, 'plannedDate'>[]): Set<number> {
  return new Set(
    segments.flatMap((s, i) => {
      const prev = segments[i - 1]?.plannedDate;
      return prev && s.plannedDate && dayNumber(s.plannedDate) < dayNumber(prev) ? [i] : [];
    }),
  );
}

/**
 * The named place a segment finishes at, with its height: its end, else its goal — named by the
 * `next` segment's start when that starts there (a goal's name is its tour's, maybe a title).
 */
export function segmentFinishPlace(
  segment: Tour,
  next?: Tour,
): { name: string | null; elevation: number | null } {
  if (segment.endPoint) return { name: segment.endPointName, elevation: segment.endPointElevation };
  const handover =
    next?.startPoint && next.startPointName && isSameGoal(next.startPoint, segment.goal);
  return handover
    ? { name: next.startPointName, elevation: next.startPointElevation ?? segment.elevation }
    : { name: segment.name, elevation: segment.elevation };
}

/** "first start → last finish" by name; null when either is unnamed. */
export function outingWay(segments: Tour[]): { from: string; to: string } | null {
  const from = segments[0]?.startPointName;
  const to = segments.length > 0 ? segmentFinishPlace(segments.at(-1)!).name : null;
  return from && to ? { from, to } : null;
}

/** Membership for a tour appended after every segment in `segments` (D13). */
export function appendedOuting(outing: TourOuting, segments: Pick<Tour, 'outing'>[]): TourOuting {
  const last = Math.max(-1, ...segments.map((s) => s.outing?.position ?? -1));
  return { id: outing.id, name: outing.name, position: last + 1 };
}

/** The day after `date` (day-precision UTC, like every tour date); null stays null. */
function nextDay(date: Date | null): Date | null {
  return date && new Date(date.getTime() + 86_400_000);
}

/**
 * The creation form's seed for the segment after `prev` (D17) — a saved segment, or a stage still
 * in the form (map-first-tour-creation D4): same activities, partners, visibility and seasons, the
 * day after its last day, starting where it ended (its end point, else its goal).
 */
export function nextSegmentSeed(prev: TourDraft & { goal: LngLat }): TourDraft {
  const fromEnd = prev.endPoint != null;
  const startElevation = fromEnd ? prev.endPointElevation : prev.elevation;
  return {
    name: null,
    // A new stage starts after a night (design D8 of smarter-tour-creation).
    plannedDate: nextDay(prev.endDate ?? prev.plannedDate),
    endDate: null,
    partnerIds: prev.partnerIds,
    tourTypes: prev.tourTypes,
    legs: prev.legs ?? null,
    elevation: null,
    gpxFilepath: null,
    description: null,
    seasons: prev.seasons,
    startPoint: fromEnd ? prev.endPoint : prev.goal,
    endPoint: null,
    startPointName: (fromEnd ? prev.endPointName : prev.name) || null,
    // The goal's elevation may carry decimals; a point elevation is whole metres.
    startPointElevation: startElevation == null ? null : Math.round(startElevation),
    endPointName: null,
    endPointElevation: null,
    equipment: null,
    notes: null,
    visibility: prev.visibility,
  };
}
