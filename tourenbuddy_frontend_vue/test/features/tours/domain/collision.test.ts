import type { Tour } from '@/features/tours/domain/entities/tour'
import { describe, expect, it } from 'vitest'
import {
  friendTourIdsShadowedByOwned,
  ownedTourIdsShadowedByFriends,
  sharesActivity,
} from '@/features/tours/domain/collision'
import { TOUR_FILL } from '../../../fixtures/tour-fill'

// Sertig (~46.73, 9.86). ~120m north is outside the 100m radius; ~50m is inside.
const GOAL = { lng: 9.86, lat: 46.73 }
const NEAR = { lng: 9.86, lat: 46.7304 } // ~44m north
const FAR = { lng: 9.86, lat: 46.732 } // ~220m north

function friendTour(overrides: Partial<Tour>): Tour {
  return {
    ...TOUR_FILL,
    id: 'f1',
    userId: 'owner',
    plannedDate: null,
    goal: GOAL,
    name: 'Shared',
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
    isFriendTour: true,
    isPartner: true,
    partnerNames: [],
    ...overrides,
  }
}

describe('friendTourIdsShadowedByOwned', () => {
  it('shadows a friend tour colliding with an owned tour', () => {
    const owned = [friendTour({ id: 'o1', isFriendTour: false, goal: GOAL })]
    const friends = [friendTour({ id: 'f1', goal: NEAR })]
    expect(friendTourIdsShadowedByOwned(owned, friends).has('f1')).toBe(true)
  })

  it('does not shadow a friend tour far from every owned tour', () => {
    const owned = [friendTour({ id: 'o1', isFriendTour: false, goal: GOAL })]
    const friends = [friendTour({ id: 'f1', goal: FAR })]
    expect(friendTourIdsShadowedByOwned(owned, friends).size).toBe(0)
  })
})

describe('ownedTourIdsShadowedByFriends', () => {
  it('shadows an owned tour colliding with a (selected) friend tour', () => {
    const owned = [friendTour({ id: 'o1', isFriendTour: false, goal: GOAL })]
    const friends = [friendTour({ id: 'f1', goal: NEAR })]
    expect(ownedTourIdsShadowedByFriends(owned, friends).has('o1')).toBe(true)
  })

  it('does not shadow an owned tour far from every friend tour', () => {
    const owned = [friendTour({ id: 'o1', isFriendTour: false, goal: GOAL })]
    const friends = [friendTour({ id: 'f1', goal: FAR })]
    expect(ownedTourIdsShadowedByFriends(owned, friends).size).toBe(0)
  })

  it('returns an empty set when no friend tours are given', () => {
    const owned = [friendTour({ id: 'o1', isFriendTour: false, goal: GOAL })]
    expect(ownedTourIdsShadowedByFriends(owned, []).size).toBe(0)
  })
})

describe('sharesActivity', () => {
  it('matches when one of several activities is shared', () => {
    expect(sharesActivity(['skitour', 'hiking'], ['hiking'])).toBe(true)
  })

  it('does not match disjoint activities', () => {
    expect(sharesActivity(['skitour'], ['hiking', 'climbing'])).toBe(false)
  })

  it('never matches an untyped tour, not even another untyped one', () => {
    expect(sharesActivity([], [])).toBe(false)
    expect(sharesActivity([], ['hiking'])).toBe(false)
  })
})
