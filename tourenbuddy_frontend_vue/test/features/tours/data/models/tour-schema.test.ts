import { describe, expect, it } from 'vitest'
import {
  friendTourRowSchema,
  tourRowSchema,
  tourSchema,
} from '@/features/tours/data/models/tour-schema'

const baseRow = {
  id: 'tour-1',
  user_id: 'user-1',
  planned_date: null,
  lon: 8.2,
  lat: 46.8,
  name: 'Test Tour',
  partner_ids: [],
}

describe('tourSchema invariant: no owner address-book snapshots', () => {
  it('should carry partnerIds and registered-user partnerNames, never owner contact data', () => {
    const shape = tourSchema.shape
    // Owner path: contact ids. Friend path: server-resolved registered-user names.
    expect(shape).toHaveProperty('partnerIds')
    expect(shape).toHaveProperty('partnerNames')
    // The owner's private address book must never be projected into a tour.
    expect(shape).not.toHaveProperty('partnerPhones')
    expect(shape).not.toHaveProperty('partners')
    expect(shape).not.toHaveProperty('partnerDisplayNames')
    expect(shape).not.toHaveProperty('partnerContactMethods')
  })
})

describe('friendTourRowSchema: unresolved partner count', () => {
  const friendBaseRow = {
    id: 'tour-1',
    user_id: 'owner-1',
    planned_date: null,
    lon: 8.2,
    lat: 46.8,
    name: 'Friend Tour',
  }

  it('should map unresolved_partner_count to unresolvedPartnerCount', () => {
    const result = friendTourRowSchema.parse({ ...friendBaseRow, unresolved_partner_count: 2 })
    expect(result.unresolvedPartnerCount).toBe(2)
  })

  it('should default unresolvedPartnerCount to 0 when the column is absent', () => {
    const result = friendTourRowSchema.parse(friendBaseRow)
    expect(result.unresolvedPartnerCount).toBe(0)
  })

  it('should reject a negative count', () => {
    expect(() =>
      friendTourRowSchema.parse({ ...friendBaseRow, unresolved_partner_count: -1 }),
    ).toThrow()
  })
})

describe('tourRowSchema: start/end point metadata fields', () => {
  it('should default new metadata fields to null when absent (legacy row)', () => {
    const result = tourRowSchema.parse(baseRow)
    expect(result.startPointName).toBeNull()
    expect(result.startPointElevation).toBeNull()
    expect(result.endPointName).toBeNull()
    expect(result.endPointElevation).toBeNull()
  })

  it('should parse all four metadata fields when present', () => {
    const result = tourRowSchema.parse({
      ...baseRow,
      start_point_name: 'Grindelwald',
      start_point_elevation: 1034,
      end_point_name: 'Kleine Scheidegg',
      end_point_elevation: 2061,
    })
    expect(result.startPointName).toBe('Grindelwald')
    expect(result.startPointElevation).toBe(1034)
    expect(result.endPointName).toBe('Kleine Scheidegg')
    expect(result.endPointElevation).toBe(2061)
  })

  it('should accept null values for all four metadata fields', () => {
    const result = tourRowSchema.parse({
      ...baseRow,
      start_point_name: null,
      start_point_elevation: null,
      end_point_name: null,
      end_point_elevation: null,
    })
    expect(result.startPointName).toBeNull()
    expect(result.startPointElevation).toBeNull()
    expect(result.endPointName).toBeNull()
    expect(result.endPointElevation).toBeNull()
  })
})

describe('tourRowSchema completed field', () => {
  it('should default completed to false when field is absent', () => {
    const result = tourRowSchema.parse(baseRow)
    expect(result.completed).toBe(false)
  })

  it('should parse completed as true when set', () => {
    const result = tourRowSchema.parse({ ...baseRow, completed: true })
    expect(result.completed).toBe(true)
  })

  it('should parse completed as false when explicitly false', () => {
    const result = tourRowSchema.parse({ ...baseRow, completed: false })
    expect(result.completed).toBe(false)
  })
})

describe('outing columns (#338)', () => {
  it('should map the outing columns to a membership', () => {
    const row = { ...baseRow, outing_id: 'o1', outing_name: null, outing_position: 0 }
    expect(tourRowSchema.parse(row).outing).toEqual({ id: 'o1', name: null, position: 0 })
    expect(friendTourRowSchema.parse(row).outing).toEqual({ id: 'o1', name: null, position: 0 })
  })

  it('should read a row without outing columns as standalone', () => {
    expect(tourRowSchema.parse(baseRow).outing).toBeNull()
  })
})

describe('grade and start time (smarter-tour-creation)', () => {
  it('should map both, and default them to null for a row from before the columns', () => {
    expect(tourRowSchema.parse({ ...baseRow, grade: 'ZS-', start_time: '06:30' })).toMatchObject({ grade: 'ZS-', startTime: '06:30' })
    expect(tourRowSchema.parse(baseRow)).toMatchObject({ grade: null, startTime: null })
  })

  it('should keep a friend\'s grade but not a time the view withheld', () => {
    expect(friendTourRowSchema.parse({ ...baseRow, grade: 'T4', start_time: null })).toMatchObject({ grade: 'T4', startTime: null })
  })
})
