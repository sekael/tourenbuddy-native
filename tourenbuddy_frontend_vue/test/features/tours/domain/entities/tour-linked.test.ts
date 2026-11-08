import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it } from 'vitest'
import { toursToGeoJson } from '@/features/tours/domain/entities/tour'
import { TOUR_FILL } from '../../../../fixtures/tour-fill'

function makeTour(id: string): Tour {
  return {
    ...TOUR_FILL,
    id,
    userId: 'u',
    plannedDate: null,
    goal: { lng: 8.5, lat: 47 },
    name: id,
    partnerIds: [],
    tourTypes: [],
    elevation: null,
    gpxFilepath: null,
    description: null,
    seasons: null,
    startPoint: null,
    endPoint: null,
    startPointName: null,
    startPointElevation: null,
    endPointName: null,
    endPointElevation: null,
    equipment: null,
    notes: null,
    completed: false,
    visibility: 'friends',
    isFriendTour: false,
    isPartner: false,
    partnerNames: [],
  }
}

describe('toursToGeoJson — isLinked property', () => {
  it('marks tour as linked when id is in linkedTourIds', () => {
    const fc = toursToGeoJson([makeTour('a'), makeTour('b')], {
      linkedTourIds: new Set(['a']),
    })
    expect(fc.features[0]?.properties?.isLinked).toBe(true)
    expect(fc.features[1]?.properties?.isLinked).toBe(false)
  })

  it('defaults isLinked to false when no opts passed', () => {
    const fc = toursToGeoJson([makeTour('a')])
    expect(fc.features[0]?.properties?.isLinked).toBe(false)
  })
})
