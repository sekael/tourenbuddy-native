import { describe, expect, it } from 'vitest'
import { draftStageMarkers, outingDetailMarkers, tourDetailMarkers } from '@/features/tours/domain/tour-detail-markers'

const START = { lng: 7.0, lat: 46.0 }
// ~well over 10m from START, so treated as a distinct end point
const FAR_END = { lng: 7.5, lat: 46.5 }
// a second distinct point, used as a re-picked (draft) location
const ELSEWHERE = { lng: 8.0, lat: 47.0 }
// within the 10m isSameGoal threshold of START → counts as "same" (round trip)
const NEAR_START = { lng: 7.00001, lat: 46.0 }

function input(over: Partial<Parameters<typeof tourDetailMarkers>[0]> = {}) {
  return {
    tourTypes: ['hiking' as const],
    start: { saved: null, draft: null },
    end: { saved: null, draft: null },
    ...over,
  }
}

describe('tourDetailMarkers', () => {
  it('round trip (end equals start) yields a start marker and no end marker', () => {
    const out = tourDetailMarkers(
      input({ start: { saved: START, draft: null }, end: { saved: NEAR_START, draft: null } }),
    )
    expect(out.map(m => m.pointKind)).toEqual(['start'])
  })

  it('one-way to goal (no end point) yields a start marker and no end marker', () => {
    const out = tourDetailMarkers(input({ start: { saved: START, draft: null } }))
    expect(out.map(m => m.pointKind)).toEqual(['start'])
  })

  it('distinct saved end yields both markers, both saved tone', () => {
    const out = tourDetailMarkers(
      input({ start: { saved: START, draft: null }, end: { saved: FAR_END, draft: null } }),
    )
    expect(out.map(m => m.pointKind).sort()).toEqual(['end', 'start'])
    expect(out.every(m => m.draft === false)).toBe(true)
  })

  it('an end without a start (a connected stage) yields the end marker alone', () => {
    const out = tourDetailMarkers(input({ end: { saved: FAR_END, draft: null } }))
    expect(out).toEqual([{ pointKind: 'end', lngLat: FAR_END, tourTypes: ['hiking'], draft: false }])
  })

  it('re-picking an end without a start keeps the saved end and adds a draft end', () => {
    const out = tourDetailMarkers(input({ end: { saved: FAR_END, draft: ELSEWHERE } }))
    expect(out.map(m => [m.pointKind, m.lngLat, m.draft])).toEqual([['end', FAR_END, false], ['end', ELSEWHERE, true]])
  })

  it('editing the start keeps the saved start AND end, plus a draft start', () => {
    const out = tourDetailMarkers(
      input({
        start: { saved: START, draft: ELSEWHERE },
        end: { saved: FAR_END, draft: null },
      }),
    )
    const starts = out.filter(m => m.pointKind === 'start')
    const ends = out.filter(m => m.pointKind === 'end')
    // saved start (full color, old position) survives the edit
    expect(starts.some(m => !m.draft && m.lngLat === START)).toBe(true)
    // draft start (lighter, new position) shows alongside it
    expect(starts.some(m => m.draft && m.lngLat === ELSEWHERE)).toBe(true)
    // the untouched end stays as a saved marker
    expect(ends).toHaveLength(1)
    expect(ends[0]!.draft).toBe(false)
  })

  it('editing the end keeps the saved end and adds a draft end', () => {
    const out = tourDetailMarkers(
      input({
        start: { saved: START, draft: null },
        end: { saved: FAR_END, draft: ELSEWHERE },
      }),
    )
    const ends = out.filter(m => m.pointKind === 'end')
    expect(ends.some(m => !m.draft && m.lngLat === FAR_END)).toBe(true)
    expect(ends.some(m => m.draft && m.lngLat === ELSEWHERE)).toBe(true)
  })

  it('creation (draft only) renders draft markers and dedups a draft round trip', () => {
    const both = tourDetailMarkers(
      input({ start: { saved: null, draft: START }, end: { saved: null, draft: FAR_END } }),
    )
    expect(both.map(m => m.pointKind).sort()).toEqual(['end', 'start'])
    expect(both.every(m => m.draft === true)).toBe(true)

    const roundTrip = tourDetailMarkers(
      input({ start: { saved: null, draft: START }, end: { saved: null, draft: NEAR_START } }),
    )
    expect(roundTrip.map(m => m.pointKind)).toEqual(['start'])
  })
})

describe('outingDetailMarkers', () => {
  const A = { lng: 9.8, lat: 46.6 }
  const H = { lng: 9.86, lat: 46.64 }
  const P = { lng: 9.9, lat: 46.62 }
  const E = { lng: 9.95, lat: 46.6 }
  const seg = (s: object) => ({ tourTypes: ['hiking'] as const, goal: H, startPoint: null, endPoint: null, ...s }) as never

  it('should start at the first segment and end at the last, in each one\'s colours', () => {
    const m = outingDetailMarkers([seg({ startPoint: A }), seg({ tourTypes: ['mountaineering'], startPoint: H, goal: P, endPoint: E })])
    expect(m.map(x => [x.pointKind, x.lngLat, x.tourTypes[0]])).toEqual([['start', A, 'hiking'], ['end', E, 'mountaineering']])
  })

  it('should mark both loose ends of a reordered outing, not the hand-over on a goal', () => {
    // Summit day first (starts at the hut = the other segment's goal), hut walk second.
    const m = outingDetailMarkers([seg({ startPoint: H, goal: P, endPoint: E }), seg({ startPoint: A })])
    expect(m.map(x => [x.pointKind, x.lngLat])).toEqual([['end', E], ['start', A]])
  })

  it('should mark a hand-over off any goal once, as a via ring in the next segment\'s types', () => {
    const m = outingDetailMarkers([
      seg({ startPoint: A, endPoint: E }),
      seg({ startPoint: { ...E }, goal: P, tourTypes: ['paragliding'] }),
    ])
    expect(m.map(x => x.pointKind)).toEqual(['start', 'via'])
    expect(m[1]).toMatchObject({ lngLat: E, tourTypes: ['paragliding'] })
  })

  it('should hand a new first stage connected without a start over at the next start, a via ring at each handover', () => {
    // C (goal only, then connected: its end = A's start) put before A–B.
    const m = outingDetailMarkers([
      seg({ goal: P, endPoint: { ...A } }),
      seg({ startPoint: A, endPoint: E }),
      seg({ startPoint: { ...E }, goal: { lng: 9.97, lat: 46.65 } }),
    ])
    expect(m.map(x => [x.pointKind, x.lngLat])).toEqual([['via', A], ['via', E]])
  })

  it('should drop an end back at the start or on the last goal', () => {
    expect(outingDetailMarkers([seg({ startPoint: A }), seg({ goal: P, endPoint: { ...A } })])).toHaveLength(1)
    expect(outingDetailMarkers([seg({ startPoint: A }), seg({ goal: P, endPoint: { ...P } })])).toHaveLength(1)
  })
})

describe('draftStageMarkers', () => {
  const A = { lng: 8.0, lat: 46.0 }
  const B = { lng: 8.1, lat: 46.1 }
  const C = { lng: 8.2, lat: 46.2 }

  it('should draw the next day\'s start once, not on the goal it starts from', () => {
    const markers = draftStageMarkers([
      { tourTypes: [], goal: B, startPoint: A, endPoint: null },
      { tourTypes: [], goal: null, startPoint: B, endPoint: C },
    ])
    expect(markers.map(m => [m.pointKind, m.lngLat])).toEqual([['start', A], ['end', C]])
    expect(markers.every(m => m.draft)).toBe(true)
  })
})
