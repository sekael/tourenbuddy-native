import { describe, expect, it } from 'vitest'
import { seasonRuns } from '@/features/calendar/domain/season-runs'

// Axis order: [winter=0, spring=1, summer=2, autumn=3]
describe('seasonRuns', () => {
  it('merges adjacent seasons into one spanning run', () => {
    expect(seasonRuns(['spring', 'summer'])).toEqual([{ start: 1, span: 2 }])
  })

  it('spans the full axis for all four contiguous seasons', () => {
    expect(seasonRuns(['winter', 'spring', 'summer', 'autumn'])).toEqual([{ start: 0, span: 4 }])
  })

  it('keeps non-contiguous seasons as separate runs, never bridging the gap', () => {
    expect(seasonRuns(['winter', 'summer'])).toEqual([
      { start: 0, span: 1 },
      { start: 2, span: 1 },
    ])
  })

  it('does NOT wrap around: autumn + winter are two separate runs', () => {
    expect(seasonRuns(['autumn', 'winter'])).toEqual([
      { start: 0, span: 1 },
      { start: 3, span: 1 },
    ])
  })

  it('ignores input order and duplicates', () => {
    expect(seasonRuns(['summer', 'spring', 'summer'])).toEqual([{ start: 1, span: 2 }])
  })

  it('returns no runs for an empty array or null', () => {
    expect(seasonRuns([])).toEqual([])
    expect(seasonRuns(null)).toEqual([])
  })
})
