import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it } from 'vitest'
import { toursOnMap } from '@/features/map/domain/tours-on-map'
import { TOUR_FILL } from '../../../fixtures/tour-fill'

const GOAL = { lng: 9.86, lat: 46.73 }
const NEAR = { lng: 9.86, lat: 46.7304 } // ~44 m: collides
const tour = (over: Partial<Tour>): Tour => ({ ...TOUR_FILL, id: 'x', userId: 'me', name: 'T', goal: GOAL, partnerIds: [], tourTypes: [], completed: false, ...over } as Tour)

const owned = tour({ id: 'o1' })
const partnerFriend = tour({ id: 'f1', userId: 'lena', goal: NEAR, isFriendTour: true, isPartner: true })
const otherFriend = tour({ id: 'f2', userId: 'lena', isFriendTour: true, isPartner: false })
const ids = (tours: Tour[]) => tours.map(t => t.id)

describe('toursOnMap', () => {
  it('should leave a non-partner friend tour unmarked even when the list keeps it', () => {
    expect(ids(toursOnMap([owned], [partnerFriend, otherFriend], null, new Set(['f2'])))).toEqual([])
  })

  it('should un-shadow a friend tour once the list hides the owned tour on its spot', () => {
    expect(ids(toursOnMap([owned], [partnerFriend], null, null))).toEqual(['o1'])
    expect(ids(toursOnMap([owned], [partnerFriend], null, new Set(['f1'])))).toEqual(['f1'])
  })

  it('should show nothing when the list keeps nothing', () => {
    expect(toursOnMap([owned], [partnerFriend], null, new Set())).toEqual([])
  })
})
