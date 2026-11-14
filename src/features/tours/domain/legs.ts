import type { TourType } from '@/features/tours/data/models/tour-type';

/**
 * A tour's activities per leg (change: activity-legs): the way up runs start → goal, the way
 * down goal → end. `null` = every activity both ways. Both in `TOUR_TYPE_VALUES` order, their
 * union is the tour's `tourTypes` (DB CHECK `tours_legs_check`).
 */
export interface TourLegs {
  ascent: TourType[];
  descent: TourType[];
}

export type LegDirection = 'up' | 'both' | 'down';

interface LegTour {
  tourTypes: readonly TourType[];
  legs?: TourLegs | null;
}

/**
 * An untouched activity's way (design D3): paragliding with others flies down, a bike with
 * hiking rides down (hike & bike: carried up, ridden down), the rest go up; otherwise both ways.
 */
export function defaultDirection(type: TourType, types: readonly TourType[]): LegDirection {
  const down = types.includes('paragliding')
    ? 'paragliding'
    : types.includes('mountain-biking') && types.includes('hiking')
      ? 'mountain-biking'
      : null;
  if (types.length < 2 || !down) return 'both';
  return type === down ? 'down' : 'up';
}

/** Each way keeps an activity — the picker never lets the last one leave a way. */
export function waysCovered(
  types: readonly TourType[],
  direction: (type: TourType) => LegDirection,
): boolean {
  return types.some((t) => direction(t) !== 'down') && types.some((t) => direction(t) !== 'up');
}

/** The legs a way per activity gives; null when nothing differs or a leg would be empty. */
export function legsFrom(
  types: readonly TourType[],
  direction: (type: TourType) => LegDirection,
): TourLegs | null {
  const ascent = types.filter((t) => direction(t) !== 'down');
  const descent = types.filter((t) => direction(t) !== 'up');
  const split = ascent.length < types.length || descent.length < types.length;
  return split && ascent.length > 0 && descent.length > 0 ? { ascent, descent } : null;
}

/** An activity's way in stored legs; `both` for an unsplit tour or an activity the legs don't name. */
export function directionOf(legs: TourLegs | null, type: TourType): LegDirection {
  const up = legs?.ascent.includes(type) ?? true;
  const down = legs?.descent.includes(type) ?? true;
  return up === down ? 'both' : up ? 'up' : 'down';
}

/** The legs still add up to these activities — the server's rule for keeping them (D2). */
export function legsMatch(types: readonly TourType[], legs: TourLegs): boolean {
  const union = new Set([...legs.ascent, ...legs.descent]);
  return union.size === types.length && types.every((t) => union.has(t));
}

/** The activities the way the route runs — the way up first. */
export function routeOrder(tour: {
  tourTypes: readonly TourType[];
  legs?: TourLegs | null;
}): TourType[] {
  const { legs } = tour;
  return legs
    ? [...legs.ascent, ...legs.descent.filter((t) => !legs.ascent.includes(t))]
    : [...tour.tourTypes];
}

/** The way down ends in a flight — ski or walk to a lower launch first or not — so the end is a landing. */
export function landsByAir(tour: {
  tourTypes: readonly TourType[];
  legs?: TourLegs | null;
}): boolean {
  return (tour.legs?.descent ?? tour.tourTypes).includes('paragliding');
}

/** A way that includes a flight: its activities, the glider last. `null` = not flown. */
export type FlownWay = readonly TourType[] | null;
export interface Flight {
  up: FlownWay;
  down: FlownWay;
}

/** The flown ways; an unsplit tour's way up is how you get to the launch, never flown. */
export function flight(tour: LegTour): Flight {
  const flown = (types: readonly TourType[] | undefined): FlownWay =>
    types?.includes('paragliding')
      ? [...types.filter((t) => t !== 'paragliding'), 'paragliding']
      : null;
  return { up: flown(tour.legs?.ascent), down: flown(tour.legs?.descent ?? tour.tourTypes) };
}

/**
 * Several routes' flown ways added up — an outing's totals: a way counts only where a route
 * climbs (descends) at all, and reads flown when any counted route flies it.
 */
export function sumFlight(
  routes: readonly { tour: LegTour; ascent: number | null; descent: number | null }[],
): Flight {
  const total = (
    key: keyof Flight,
    moves: (r: (typeof routes)[number]) => boolean,
    types: (t: LegTour) => readonly TourType[],
  ): FlownWay => {
    const counted = routes.filter(moves);
    if (!counted.some((r) => flight(r.tour)[key])) return null;
    const all = new Set(counted.flatMap((r) => flight(r.tour)[key] ?? types(r.tour)));
    return [...[...all].filter((t) => t !== 'paragliding'), 'paragliding'];
  };
  return {
    up: total(
      'up',
      (r) => !!r.ascent,
      (t) => t.legs?.ascent ?? t.tourTypes.filter((type) => type !== 'paragliding'),
    ),
    down: total(
      'down',
      (r) => !!r.descent,
      (t) => t.legs?.descent ?? t.tourTypes,
    ),
  };
}

/** Legs that differ by way; a glider flown the whole way (both legs alike) reads as one activity. */
export function legsApart(legs: TourLegs | null | undefined): TourLegs | null {
  return legs && legs.ascent.join() !== legs.descent.join() ? legs : null;
}
