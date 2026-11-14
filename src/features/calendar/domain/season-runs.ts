import type { Season } from '@/features/tours/data/models/season';

/**
 * Fixed Gantt axis order (matches the #240 mockup: Winter DEC–FEB → Spring
 * MAR–MAY → Summer JUN–AUG → Fall SEP–NOV). The Seasons view always renders
 * these four columns in this order regardless of what a tour is tagged with.
 */
export const SEASON_AXIS = ['winter', 'spring', 'summer', 'autumn'] as const;

export interface SeasonRun {
  /** 0-based column index of the run's first season on {@link SEASON_AXIS}. */
  start: number;
  /** Number of contiguous columns the run spans (always ≥ 1). */
  span: number;
}

/**
 * Collapse a tour's (unordered, possibly-duplicated) tagged seasons into
 * contiguous runs over the fixed 4-season axis, so the Seasons view can draw
 * one spanning bar per run.
 *
 * Rules:
 * - Adjacent tagged seasons merge into a single run spanning their columns.
 * - An untagged season (a gap) always breaks a run — gaps are never bridged.
 * - Input order and duplicates don't matter.
 * - Winter and autumn are the two ends of the axis; they are NOT adjacent
 *   (no wraparound).
 *
 * Examples (over [winter, spring, summer, autumn]):
 * - `['spring','summer']`        → `[{ start: 1, span: 2 }]`
 * - `['winter','summer']`        → `[{ start: 0, span: 1 }, { start: 2, span: 1 }]`
 * - `['autumn','winter']`        → `[{ start: 0, span: 1 }, { start: 3, span: 1 }]`
 * - `[]` / `null`               → `[]`
 */
export function seasonRuns(seasons: Season[] | null): SeasonRun[] {
  // Presence vector over the fixed axis: present[i] === true iff the tour is
  // tagged with SEASON_AXIS[i]. Order/duplicates in the input wash out here.
  const present = SEASON_AXIS.map((season) => seasons?.includes(season) ?? false);
  if (!present.some(Boolean)) return [];

  const runs: SeasonRun[] = [];
  for (let i = 0; i < present.length; i++) {
    if (!present[i]) continue;

    // Returns undefined if runs.at(-1) does not exist
    const last = runs.at(-1);

    // If last.start + last.span equal the current season index, we have a continuous run, otherwise, run ends
    if (last && last.start + last.span === i) {
      last.span++;
    } else {
      runs.push({ start: i, span: 1 });
    }
  }
  return runs;
}
