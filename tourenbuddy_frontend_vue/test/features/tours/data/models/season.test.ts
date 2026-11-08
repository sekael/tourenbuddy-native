import { describe, expect, it } from 'vitest'
import { seasonsForDates } from '@/features/tours/data/models/season'

const d = (iso: string) => new Date(iso)

describe('seasonsForDates', () => {
  it('should give no season to an undated tour', () => {
    expect(seasonsForDates(null, d('2027-03-13'))).toEqual([])
  })

  it('should take every season a span touches, across a month and a year end', () => {
    expect(seasonsForDates(d('2027-02-26'), d('2027-03-02'))).toEqual(['winter', 'spring'])
    expect(seasonsForDates(d('2026-12-30'), d('2027-01-02'))).toEqual(['winter'])
    expect(seasonsForDates(d('2027-11-30'), d('2027-12-01'))).toEqual(['winter', 'autumn'])
  })

  it('should ignore an end before the start and cap a span longer than a year', () => {
    expect(seasonsForDates(d('2027-07-10'), d('2027-03-01'))).toEqual(['summer'])
    expect(seasonsForDates(d('2027-01-01'), d('2029-01-01'))).toEqual(['winter', 'spring', 'summer', 'autumn'])
  })
})
