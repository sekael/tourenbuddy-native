import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it } from 'vitest'
import {
  appendedOuting,
  movedSegment,
  nextSegmentSeed,
  outingChains,
  outingDateConflicts,
  outingDisplayName,
  outingGaps,
  outingKey,
  outingNights,
  outingSegments,
  outingSpan,
  outingWay,
  segmentFinishPlace,
  spanDays,
} from '@/features/tours/domain/outing'
import { TOUR_FILL } from '../../../fixtures/tour-fill'

const OUTING = 'o1'

function tour(overrides: Partial<Tour>): Tour {
  return {
    ...TOUR_FILL,
    id: 't',
    userId: 'me',
    plannedDate: null,
    goal: { lng: 7.5, lat: 46 },
    name: 'Tour',
    partnerIds: [],
    tourTypes: [],
    elevation: null,
    gpxFilepath: null,
    description: null,
    seasons: null,
    startPoint: null,
    endPoint: null,
    equipment: null,
    notes: null,
    completed: false,
    ...overrides,
  }
}

function segment(id: string, position: number, extra: Partial<Tour> = {}) {
  return tour({ id, outing: { id: OUTING, name: null, position }, ...extra })
}

describe('outingSegments', () => {
  it('should order by position, then id when two offline edits picked the same position', () => {
    const tours = [segment('c', 5), segment('b', 0), segment('a', 0)]
    expect(outingSegments(tours, outingKey(tours[0]!)).map(t => t.id)).toEqual(['a', 'b', 'c'])
  })

  it('should not pull a friend\'s tour carrying a copied outing id into the outing', () => {
    const tours = [segment('a', 0), segment('b', 1), segment('x', 2, { userId: 'friend' })]
    expect(outingSegments(tours, outingKey(tours[0]!)).map(t => t.id)).toEqual(['a', 'b'])
  })

  it('should treat a lone visible segment as no outing', () => {
    expect(outingSegments([segment('a', 0), tour({ id: 'b' })], `me/${OUTING}`)).toEqual([])
  })

  it('should return no segments for a standalone tour', () => {
    expect(outingKey(tour({}))).toBeNull()
    expect(outingSegments([tour({})], null)).toEqual([])
  })
})

describe('outingDisplayName', () => {
  it('should fall back to the first segment\'s name when the outing has none', () => {
    expect(outingDisplayName([segment('a', 0, { name: 'Hut' }), segment('b', 1)])).toBe('Hut')
  })
})

describe('outingSpan', () => {
  it('should span from the earliest day to the latest end day across segments', () => {
    const span = outingSpan([
      segment('a', 0, { plannedDate: new Date('2027-03-13') }),
      segment('b', 1, { plannedDate: new Date('2027-03-12'), endDate: new Date('2027-03-15') }),
      segment('c', 2),
    ])
    expect(span).toEqual({ start: new Date('2027-03-12'), end: new Date('2027-03-15') })
  })

  it('should be null when no segment is dated', () => {
    expect(outingSpan([segment('a', 0), segment('b', 1)])).toBeNull()
  })
})

describe('appendedOuting', () => {
  it('should append after the highest position, gaps included', () => {
    const outing = { id: OUTING, name: 'Route', position: 0 }
    expect(appendedOuting(outing, [segment('a', 0), segment('b', 4)]).position).toBe(5)
  })
})

describe('nextSegmentSeed', () => {
  it('should start at the previous segment\'s end point the day after its last day', () => {
    const seed = nextSegmentSeed(segment('a', 0, {
      plannedDate: new Date('2027-03-11'),
      endDate: new Date('2027-03-12'),
      endPoint: { lng: 7.6, lat: 46.1 },
      endPointName: 'Cabane de Bertol',
      endPointElevation: 3311,
      tourTypes: ['skitour'],
    }))
    expect(seed).toMatchObject({
      plannedDate: new Date('2027-03-13'),
      startPoint: { lng: 7.6, lat: 46.1 },
      startPointName: 'Cabane de Bertol',
      startPointElevation: 3311,
      tourTypes: ['skitour'],
      name: null,
      endPoint: null,
    })
  })

  it('should start at the goal with a whole-metre elevation when the previous segment has no end point', () => {
    const seed = nextSegmentSeed(segment('a', 0, { name: 'Hut', elevation: 2632.4 }))
    expect(seed).toMatchObject({ startPoint: { lng: 7.5, lat: 46 }, startPointName: 'Hut', startPointElevation: 2632 })
  })

  it('should leave the date empty after an undated segment, and cross a month end', () => {
    expect(nextSegmentSeed(segment('a', 0, { plannedDate: null })).plannedDate).toBeNull()
    expect(nextSegmentSeed(segment('a', 0, { plannedDate: new Date('2027-02-28') })).plannedDate).toEqual(new Date('2027-03-01'))
  })
})

describe('outingGaps', () => {
  const A = { lng: 9.8, lat: 46.6 }
  const H = { lng: 9.86, lat: 46.64 }
  const E = { lng: 9.95, lat: 46.6 }
  const pts = (startPoint: typeof A | null, goal: typeof A, endPoint: typeof A | null = null) => ({ startPoint, goal, endPoint })

  it('should flag a segment starting away from the previous finish (end, else goal)', () => {
    expect(outingGaps([pts(H, E, A), pts(A, H)])).toEqual([])
    expect(outingGaps([pts(A, H), pts({ ...H }, E)])).toEqual([])
    expect(outingGaps([pts(H, E, A), pts(E, H)])).toEqual([{ index: 1, from: A, to: E }])
  })

  it('should not flag a segment without a start', () => {
    expect(outingGaps([pts(A, H), pts(null, E)])).toEqual([])
  })
})

describe('movedSegment', () => {
  it('should move an item forwards and backwards', () => {
    expect(movedSegment(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(movedSegment(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })
})

describe('outingNights', () => {
  const day = (d: string) => new Date(d)

  it('should mark a night only where the next segment starts on a later day', () => {
    const nights = outingNights([
      { plannedDate: day('2026-11-29'), endDate: null },
      { plannedDate: day('2026-11-30'), endDate: null },
      { plannedDate: day('2026-11-30'), endDate: null },
    ])
    expect([...nights]).toEqual([1])
  })

  it('should count from a multi-day segment\'s last day, and never for undated segments', () => {
    expect([...outingNights([
      { plannedDate: day('2026-07-01'), endDate: day('2026-07-02') },
      { plannedDate: day('2026-07-02'), endDate: null },
    ])]).toEqual([])
    expect([...outingNights([{ plannedDate: null, endDate: null }, { plannedDate: day('2026-07-02'), endDate: null }])]).toEqual([])
  })

  it('should treat a local midnight and a stored UTC midnight as the same day', () => {
    expect([...outingNights([
      { plannedDate: new Date('2026-11-29T23:00:00Z'), endDate: null }, // 30 Nov, local midnight in CH
      { plannedDate: day('2026-11-30'), endDate: null },
    ])]).toEqual([])
  })
})

describe('spanDays', () => {
  it('should count both the first and the last day', () => {
    expect(spanDays({ start: new Date('2026-11-29'), end: new Date('2026-11-30') })).toBe(2)
    expect(spanDays({ start: new Date('2026-11-29'), end: new Date('2026-11-29') })).toBe(1)
  })
})

describe('outingWay', () => {
  it('should run from the first start to the last finish — its end, else its goal', () => {
    const first = segment('a', 0, { startPointName: 'Bergün', startPoint: { lng: 9.7, lat: 46.6 } })
    expect(outingWay([first, segment('b', 1, { name: 'Piz Kesch' })])).toEqual({ from: 'Bergün', to: 'Piz Kesch' })
    expect(outingWay([first, segment('b', 1, { endPoint: { lng: 9.8, lat: 46.5 }, endPointName: 'Bever' })]))
      .toEqual({ from: 'Bergün', to: 'Bever' })
  })

  it('should give no way when the first start has no name', () => {
    expect(outingWay([segment('a', 0), segment('b', 1)])).toBeNull()
  })
})

describe('outingDateConflicts', () => {
  it('should flag a segment dated before the previous one, but not a same-day or undated one', () => {
    const d = (s: string | null) => ({ plannedDate: s ? new Date(s) : null })
    expect([...outingDateConflicts([d('2026-11-30'), d('2026-11-29'), d('2026-11-29'), d(null), d('2026-11-01')])]).toEqual([1])
  })
})

describe('outingChains', () => {
  it('should chain segment goals in order and leave out the open outing and lone segments', () => {
    const tours = [
      segment('b', 1, { goal: { lng: 8, lat: 46 } }),
      segment('a', 0, { goal: { lng: 7, lat: 46 } }),
      tour({ id: 'o2-only', outing: { id: 'o2', name: null, position: 0 } }),
      tour({ id: 'x', userId: 'friend', outing: { id: OUTING, name: null, position: 2 } }),
    ]
    expect(outingChains(tours, null)).toEqual([[[7, 46], [8, 46]]])
    expect(outingChains(tours, `me/${OUTING}`)).toEqual([])
  })
})

describe('segmentFinishPlace', () => {
  it('should name a goal-finish by the next stage\'s start there, not by the tour\'s title', () => {
    const day1 = segment('a', 0, { name: 'Review Trek', elevation: 2928, endPoint: null })
    const day2 = segment('b', 1, { startPoint: day1.goal, startPointName: 'Cabane des Dix', startPointElevation: null })
    expect(segmentFinishPlace(day1, day2)).toEqual({ name: 'Cabane des Dix', elevation: 2928 })
    expect(segmentFinishPlace(day1)).toEqual({ name: 'Review Trek', elevation: 2928 })
  })
})
