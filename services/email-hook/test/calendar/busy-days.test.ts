import { describe, expect, it } from 'vitest'
import { deriveAvailableDays } from '../../src/calendar/busy-days'

// Zurich is UTC+2 in summer (CEST), UTC+1 in winter (CET).
const occ = (start: string, end: string) => ({ start: new Date(start), end: new Date(end) })
const summer = { from: '2030-07-01', to: '2030-07-01', coreStart: '06:00:00', coreEnd: '18:00:00', minFreeMinutes: 360 }

describe('deriveAvailableDays', () => {
  it('should mark a full working day busy', () => {
    expect(deriveAvailableDays([occ('2030-07-01T07:00Z', '2030-07-01T15:00Z')], summer)).toEqual([])
  })

  it('should keep a day with two scattered calls available', () => {
    const calls = [occ('2030-07-01T07:00Z', '2030-07-01T07:30Z'), occ('2030-07-01T14:00Z', '2030-07-01T14:30Z')]
    expect(deriveAvailableDays(calls, summer)).toEqual(['2030-07-01'])
  })

  it('should mark busy when two feeds jointly leave no 6 h block', () => {
    const union = [occ('2030-07-01T04:00Z', '2030-07-01T10:00Z'), occ('2030-07-01T10:00Z', '2030-07-01T16:00Z')]
    expect(deriveAvailableDays(union, summer)).toEqual([])
  })

  it('should count the trailing gap when the only event ends at 09:00', () => {
    expect(deriveAvailableDays([occ('2030-07-01T04:00Z', '2030-07-01T07:00Z')], summer)).toEqual(['2030-07-01'])
  })

  it('should ignore an event ending exactly at coreStart', () => {
    const rule = { ...summer, minFreeMinutes: 720 }
    expect(deriveAvailableDays([occ('2030-07-01T02:00Z', '2030-07-01T04:00Z')], rule)).toEqual(['2030-07-01'])
  })

  it('should block every day a Fri 18:00 → Sun 20:00 event spans inside the window', () => {
    const rule = { ...summer, from: '2030-07-05', to: '2030-07-08' }
    const weekend = occ('2030-07-05T16:00Z', '2030-07-07T18:00Z')
    // Fri: busy only after 18:00 (outside window). Sat + Sun: fully blocked. Mon: free.
    expect(deriveAvailableDays([weekend], rule)).toEqual(['2030-07-05', '2030-07-08'])
  })

  it('should require an empty window when minFreeMinutes equals the whole window', () => {
    const rule = { ...summer, from: '2030-07-01', to: '2030-07-02', minFreeMinutes: 720 }
    const oneMinute = occ('2030-07-01T10:00Z', '2030-07-01T10:01Z')
    expect(deriveAvailableDays([oneMinute], rule)).toEqual(['2030-07-02'])
  })

  it('should not let an interval nested in an earlier one pull the cursor back', () => {
    // 06–08, 10–14, nested 10:30–11:00 local: trailing gap is 14–18 = 4 h, not 11–18 = 7 h.
    const nested = [
      occ('2030-07-01T03:00Z', '2030-07-01T06:00Z'),
      occ('2030-07-01T08:00Z', '2030-07-01T12:00Z'),
      occ('2030-07-01T08:30Z', '2030-07-01T09:00Z'),
    ]
    expect(deriveAvailableDays(nested, summer)).toEqual([])
  })

  it('should use local wall time on the spring-forward DST day', () => {
    // 2030-03-31: clocks jump 02:00 → 03:00, so 06:00 local is 04:00Z (CEST), not 05:00Z.
    // Busy 04:00Z–10:00Z = 06:00–12:00 local leaves exactly 12:00–18:00 = 6 h free.
    const rule = { ...summer, from: '2030-03-31', to: '2030-03-31' }
    expect(deriveAvailableDays([occ('2030-03-31T04:00Z', '2030-03-31T10:00Z')], rule)).toEqual(['2030-03-31'])
    // One more minute tips it: a +01:00 bug would read this as 05:00–11:01 local and pass.
    expect(deriveAvailableDays([occ('2030-03-31T04:00Z', '2030-03-31T10:01Z')], rule)).toEqual([])
  })
})
