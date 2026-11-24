import type { Occurrence } from './parse-ics'
import { addDays, zurichWallTime } from './zurich'

export interface BusyRule {
  /** First day to evaluate, `YYYY-MM-DD` (Zurich). */
  from: string
  /** Last day to evaluate, inclusive. */
  to: string
  /** Core window, `HH:MM[:SS]` Zurich wall time (Postgres `time`). */
  coreStart: string
  coreEnd: string
  minFreeMinutes: number
}

/**
 * Days in [from, to] whose largest contiguous free block inside the core window is at least
 * `minFreeMinutes` (design D3). `occurrences` is the union of every feed's busy time.
 */
export function deriveAvailableDays(occurrences: Occurrence[], rule: BusyRule): string[] {
  const available: string[] = []

  for (let day = rule.from; day <= rule.to; day = addDays(day, 1)) {
    const dayWindowStart = zurichWallTime(day, rule.coreStart).getTime()
    const dayWindowEnd = zurichWallTime(day, rule.coreEnd).getTime()

    const busy: { start: number, end: number }[] = []
    for (const occ of occurrences) {
      const clippedStart = Math.max(dayWindowStart, occ.start.getTime())
      const clippedEnd = Math.min(dayWindowEnd, occ.end.getTime())
      if (clippedEnd > clippedStart) {
        busy.push({ start: clippedStart, end: clippedEnd })
      }
    }

    busy.sort((a, b) => a.start - b.start)

    let cursor = dayWindowStart
    let largest = 0

    for (const interval of busy) {
      largest = Math.max(largest, interval.start - cursor)
      // max, not assignment: an interval nested inside an earlier one must not pull the
      // cursor back and invent free time. This is also what merges overlaps.
      cursor = Math.max(cursor, interval.end)
    }

    // Trailing edge; for a day with no busy time this is the whole window.
    largest = Math.max(largest, dayWindowEnd - cursor)

    if (largest >= rule.minFreeMinutes * 60_000) {
      available.push(day)
    }
  }

  return available
}
