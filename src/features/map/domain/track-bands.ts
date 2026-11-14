import { haversineMeters } from '@/core/utils/haversine';
import {
  distinctTypeColors,
  TOUR_TYPE_TRACK_COLORS,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import type { TourLegs } from '@/features/tours/domain/legs';

/** Each colour gets this many bands along a whole line (the PWA's `BAND_CYCLES`). */
const BAND_CYCLES = 9;
/** Closer to either end than this share, a split line holds only one way's colours. */
const SPLIT_EDGE = 0.001;

export type Band = { color: string; coordinates: GeoJSON.Position[] };

/** Where the way down takes over (activity-legs D5): its colours from share `at` (the goal) on. */
export type WayDown = { at: number; colors: readonly string[] };

/**
 * A line in its activities' colours, as the PWA paints a track: one colour whole; several in
 * alternating bands, `BAND_CYCLES` rounds over the whole line (a part gets its share of them);
 * a split tour's way down in its own colours from the goal on. Each band is a line of its own,
 * so one source draws them all, whatever the colours.
 */
export function bandLine(
  line: readonly GeoJSON.Position[],
  colors: readonly string[],
  down?: WayDown,
): Band[] {
  const along = [0];
  for (let i = 1; i < line.length; i++) {
    along.push(along[i - 1]! + haversineMeters(at2(line[i - 1]!), at2(line[i]!)));
  }
  const total = along.at(-1)!;
  if (line.length < 2 || total === 0) return [{ color: colors[0]!, coordinates: [...line] }];

  const parts: [readonly string[], number, number][] =
    !down || down.at >= 1 - SPLIT_EDGE
      ? [[colors, 0, 1]]
      : down.at <= SPLIT_EDGE
        ? [[down.colors, 0, 1]]
        : [
            [colors, 0, down.at],
            [down.colors, down.at, 1],
          ];
  return parts.flatMap(([palette, from, to]) => {
    const count =
      palette.length < 2 ? 1 : palette.length * Math.max(1, Math.round(BAND_CYCLES * (to - from)));
    const width = (to - from) / count;
    return Array.from({ length: count }, (_, i) => ({
      color: palette[i % palette.length]!,
      coordinates: stretch(
        line,
        along,
        (from + i * width) * total,
        (from + (i + 1) * width) * total,
      ),
    }));
  });
}

const at2 = (p: GeoJSON.Position) => [p[0]!, p[1]!] as [number, number];

/** The line between distances `from` and `to` along it, its ends cut where they fall. */
function stretch(
  line: readonly GeoJSON.Position[],
  along: readonly number[],
  from: number,
  to: number,
): GeoJSON.Position[] {
  const point = (d: number) => {
    let i = 1;
    while (i < along.length - 1 && along[i]! < d) i++;
    const a = line[i - 1]!;
    const b = line[i]!;
    const span = along[i]! - along[i - 1]!;
    const f = span > 0 ? Math.min(1, Math.max(0, (d - along[i - 1]!) / span)) : 0;
    return [a[0]! + (b[0]! - a[0]!) * f, a[1]! + (b[1]! - a[1]!) * f];
  };
  const inside = line.filter((_, i) => along[i]! > from && along[i]! < to);
  return [point(from), ...inside.map(at2), point(to)];
}

/** A line of a tour without an activity. */
export const NO_TYPE_COLOR = '#334155';

/**
 * A planned or drawn route in its ways' track colours (activity-legs D5), as the saved tour shows
 * it: the way up's to share `at` of the line (its goal), the way down's after it; a tour whose
 * ways don't differ, or a route without a way down (`at` null), in its activities' colours.
 */
export function routeBands(
  line: readonly GeoJSON.Position[],
  tour: { tourTypes: readonly TourType[]; legs?: TourLegs | null },
  at: number | null,
): Band[] {
  const colors = (types: readonly TourType[]) =>
    types.length ? distinctTypeColors(types, TOUR_TYPE_TRACK_COLORS) : [NO_TYPE_COLOR];
  const { legs } = tour;
  return bandLine(
    line,
    colors(legs?.ascent ?? tour.tourTypes),
    legs && at !== null ? { at, colors: colors(legs.descent) } : undefined,
  );
}
