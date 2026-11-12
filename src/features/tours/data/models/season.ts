import { z } from 'zod';

export const SEASON_VALUES = ['winter', 'spring', 'summer', 'autumn'] as const;

export const seasonSchema = z.enum(SEASON_VALUES);

export type Season = z.infer<typeof seasonSchema>;

export const SEASON_LABELS: Record<Season, string> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
};

/** Meteorological seasons by month (0 = January). */
const MONTH_SEASON: readonly Season[] = [
  'winter',
  'winter',
  'spring',
  'spring',
  'spring',
  'summer',
  'summer',
  'summer',
  'autumn',
  'autumn',
  'autumn',
  'winter',
];

/**
 * The seasons a dated tour falls in (design D6): every season the span touches, in
 * `SEASON_VALUES` order. Dates are day-precision UTC (`new Date('2027-03-13')`). Empty undated.
 */
export function seasonsForDates(planned: Date | null, end: Date | null): Season[] {
  if (!planned) return [];
  const last = end && end > planned ? end : planned;
  const seen = new Set<Season>();
  // ponytail: month steps, capped at a year — a longer span touches every season anyway.
  const months = Math.min(
    12,
    (last.getUTCFullYear() - planned.getUTCFullYear()) * 12 +
      last.getUTCMonth() -
      planned.getUTCMonth(),
  );
  for (let i = 0; i <= months; i++) seen.add(MONTH_SEASON[(planned.getUTCMonth() + i) % 12]!);
  return SEASON_VALUES.filter((season) => seen.has(season));
}
