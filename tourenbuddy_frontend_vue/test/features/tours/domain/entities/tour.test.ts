import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it } from 'vitest'
import { toursToGeoJson, tourToGeoJsonFeature, withTourTypes } from '@/features/tours/domain/entities/tour'
import { TOUR_FILL } from '../../../../fixtures/tour-fill'

const baseTour: Tour = {
  ...TOUR_FILL,
  id: 'tour-1',
  userId: 'user-1',
  plannedDate: null,
  goal: { lng: 8.2, lat: 46.8 },
  name: 'Rigi',
  partnerIds: [],
  tourTypes: ['hiking'],
  elevation: null,
  gpxFilepath: null,
  description: null,
  seasons: null,
  startPoint: null,
  endPoint: null,
  equipment: null,
  notes: null,
  completed: false,
}

describe('tourToGeoJsonFeature', () => {
  it('should include completed: false in feature properties', () => {
    const feature = tourToGeoJsonFeature(baseTour)
    expect(feature.properties?.completed).toBe(false)
  })

  it('should include completed: true in feature properties', () => {
    const feature = tourToGeoJsonFeature({ ...baseTour, completed: true })
    expect(feature.properties?.completed).toBe(true)
  })
})

describe('toursToGeoJson', () => {
  it('should map completed property for each feature', () => {
    const tours: Tour[] = [
      { ...baseTour, id: 'a', completed: false },
      { ...baseTour, id: 'b', completed: true },
    ]
    const collection = toursToGeoJson(tours)
    expect(collection.features[0]?.properties?.completed).toBe(false)
    expect(collection.features[1]?.properties?.completed).toBe(true)
  })
})

describe('primary type on the map feature', () => {
  it('should expose the first type of a multi-activity tour', () => {
    expect(tourToGeoJsonFeature({ ...baseTour, tourTypes: ['skitour', 'hiking'] }).properties?.tourType).toBe('skitour')
  })

  it('should expose null for an untyped tour', () => {
    expect(tourToGeoJsonFeature({ ...baseTour, tourTypes: [] }).properties?.tourType).toBeNull()
  })
})

describe('withTourTypes (pre-#335 cache / outbox data)', () => {
  it('should lift a legacy single type into a one-element list', () => {
    const { tourTypes: _, ...legacy } = baseTour
    const lifted = withTourTypes({ ...legacy, tourType: 'climbing' } as unknown as Tour)
    expect(lifted.tourTypes).toEqual(['climbing'])
    expect(lifted).not.toHaveProperty('tourType')
  })

  it('should lift a legacy null type into an empty list', () => {
    const { tourTypes: _, ...legacy } = baseTour
    expect(withTourTypes({ ...legacy, tourType: null } as unknown as Tour).tourTypes).toEqual([])
  })

  it('should return current-shape data untouched', () => {
    expect(withTourTypes(baseTour)).toBe(baseTour)
  })
})
