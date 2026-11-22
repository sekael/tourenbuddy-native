import type { Tour } from '@/features/tours/domain/entities/tour';

/** To 6 decimals (~0.1 m), as a GPX track stores its points. */
const at = (lng: number, lat: number) => `${lng.toFixed(6)},${lat.toFixed(6)}`;
const point = (p: { lng: number; lat: number } | null) => p && at(p.lng, p.lat);
const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

/** Everything the owner sets on a tour; the track by presence only, its points live in a file. */
function content(t: Tour): string {
  return JSON.stringify([
    t.name,
    day(t.plannedDate),
    day(t.endDate),
    t.startTime,
    point(t.goal),
    point(t.startPoint),
    point(t.endPoint),
    t.startPointName,
    t.startPointElevation,
    t.endPointName,
    t.endPointElevation,
    t.elevation,
    t.tourTypes,
    t.legs,
    t.grade,
    t.seasons,
    [...t.partnerIds].sort(),
    t.description,
    t.equipment,
    t.notes,
    t.completed,
    t.visibility,
    t.outing?.id ?? null,
    !!t.gpxFilepath,
  ]);
}

/** Two tours alike in every field the owner sets (their tracks' points aside: `sameLine`). */
export function sameTour(a: Tour, b: Tour): boolean {
  return content(a) === content(b);
}

/** Two tracks through the same points (heights aside: the terrain's, looked up anew each time). */
export function sameLine(a: GeoJSON.Position[], b: GeoJSON.Position[]): boolean {
  return a.length === b.length && a.every((p, i) => at(p[0]!, p[1]!) === at(b[i]![0]!, b[i]![1]!));
}
