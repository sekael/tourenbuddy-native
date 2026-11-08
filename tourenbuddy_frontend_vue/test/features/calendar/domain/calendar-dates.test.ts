import { describe, expect, it } from 'vitest'
import { buildMonthGrid, dayKey, spanDayKeys } from '@/features/calendar/domain/calendar-dates'

describe('buildMonthGrid', () => {
  it('always emits a 6-week, 42-cell grid', () => {
    expect(buildMonthGrid(new Date(2024, 5, 1))).toHaveLength(42)
  })

  it('starts the grid on the Monday on/before the 1st (June 2024 starts Sat)', () => {
    // June 1 2024 is a Saturday → grid starts Mon May 27.
    const grid = buildMonthGrid(new Date(2024, 5, 15))
    expect(grid[0].date).toEqual(new Date(2024, 4, 27))
    expect(grid[0].inMonth).toBe(false)
  })

  it('pads a month whose 1st is Monday with no leading days', () => {
    // April 2024 starts on a Monday.
    const grid = buildMonthGrid(new Date(2024, 3, 10))
    expect(grid[0].date).toEqual(new Date(2024, 3, 1))
    expect(grid[0].inMonth).toBe(true)
  })

  it('marks trailing days from the next month as out-of-month', () => {
    const grid = buildMonthGrid(new Date(2024, 5, 1))
    expect(grid[41].inMonth).toBe(false)
    expect(grid[41].date.getMonth()).toBe(6) // July
  })
})

describe('dayKey', () => {
  it('uses local components, not a UTC-shifted ISO date', () => {
    // 23:30 local should still key to that local day, never roll to the next.
    expect(dayKey(new Date(2024, 5, 15, 23, 30))).toBe('2024-06-15')
  })

  it('zero-pads month and day', () => {
    expect(dayKey(new Date(2024, 0, 5))).toBe('2024-01-05')
  })
})

describe('spanDayKeys', () => {
  it('collapses a null end to the start day alone', () => {
    expect(spanDayKeys(new Date(2026, 7, 25), null)).toEqual(['2026-08-25'])
  })

  it('collapses an absent end (pre-multi-day cache snapshot) to the start day alone', () => {
    // entity-cache hydrates old snapshots with `endDate` missing, not null.
    expect(spanDayKeys(new Date(2026, 7, 25), undefined as unknown as null)).toEqual(['2026-08-25'])
  })

  it('collapses an end BEFORE the start rather than emitting a reversed range', () => {
    expect(spanDayKeys(new Date(2026, 7, 25), new Date(2026, 7, 20))).toEqual(['2026-08-25'])
  })

  it('ignores the time of day on both endpoints', () => {
    // plannedDate arrives as UTC midnight; a same-day end must not add a second key.
    const keys = spanDayKeys(new Date(2026, 7, 25, 23, 30), new Date(2026, 7, 25, 0, 1))
    expect(keys).toEqual(['2026-08-25'])
  })

  it('walks across a month boundary', () => {
    expect(spanDayKeys(new Date(2026, 8, 30), new Date(2026, 9, 2))).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
  })

  it('walks across a year boundary', () => {
    expect(spanDayKeys(new Date(2026, 11, 31), new Date(2027, 0, 1))).toEqual([
      '2026-12-31',
      '2027-01-01',
    ])
  })

  // Adding 86_400_000 ms would emit a duplicate key over the spring-forward day and skip
  // one over the fall-back day. One key per calendar day, always.
  it('yields exactly one key per day across the CH spring-forward transition', () => {
    expect(spanDayKeys(new Date(2026, 2, 28), new Date(2026, 2, 30))).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ])
  })

  it('yields exactly one key per day across the CH fall-back transition', () => {
    expect(spanDayKeys(new Date(2026, 9, 24), new Date(2026, 9, 26))).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ])
  })
})
