import type { Tour } from '@/features/tours/domain/entities/tour'
import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'
import { resetTourFilters, showFriendTours, useActiveTourTab, useListedTourIds, useTourFilters } from '@/features/tours/presentation/composables/use-tour-filters'
import { useToursStore } from '@/features/tours/presentation/stores/tours-store'
import { TOUR_FILL } from '../../../../fixtures/tour-fill'

const baseTour: Tour = {
  ...TOUR_FILL,
  id: '1',
  userId: 'u-1',
  name: 'Alpine Hike',
  plannedDate: new Date('2024-06-15'),
  endDate: null,
  goal: { lng: 8.5, lat: 47.5 },
  partnerIds: [],
  tourTypes: ['hiking'],
  elevation: 1500,
  gpxFilepath: null,
  description: null,
  seasons: ['summer'],
  startPoint: null,
  endPoint: null,
  equipment: null,
  notes: null,
  completed: false,
}

function makeTour(overrides: Partial<Tour>): Tour {
  return { ...baseTour, ...overrides }
}

describe('useTourFilters', () => {
  let pinia: ReturnType<typeof createTestingPinia>

  beforeEach(() => {
    pinia = createTestingPinia({ createSpy: () => () => {} })
    setActivePinia(pinia)
    // Reset module-level filter state (both tabs) between tests
    resetTourFilters()
  })

  function setup(
    tours: Tour[],
    contacts: {
      id: string
      firstName: string
      lastName: string | null
      displayName: string | null
    }[] = [],
  ) {
    const toursStore = useToursStore()
    const contactsStore = useContactsStore()
    toursStore.tours = tours as any
    contactsStore.contacts = contacts.map(c => ({
      ...c,
      userId: 'u-1',
      contactMethods: [],
    })) as any
    return useTourFilters()
  }

  describe('resetTourFilters', () => {
    it('should clear search and filters on both tabs but keep the active tab', () => {
      const owned = useTourFilters('owned')
      const friends = useTourFilters('friends')
      const tab = useActiveTourTab()
      tab.value = 'friends'
      owned.searchQuery.value = 'piz'
      owned.filters.seasons = new Set(['winter'])
      friends.filters.dateRange.from = new Date('2024-01-01')
      friends.filters.completion = 'done'

      resetTourFilters()

      expect([owned.searchQuery.value, friends.searchQuery.value]).toEqual(['', ''])
      expect(owned.activeFilterCount.value + friends.activeFilterCount.value).toBe(0)
      expect(tab.value).toBe('friends')
      tab.value = 'owned'
    })
  })

  describe('search', () => {
    it('should return all tours when query is empty', () => {
      const tours = [makeTour({ id: '1', name: 'Alpine Hike' })]
      const { filteredTours } = setup(tours)
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should return all tours when query is whitespace only', () => {
      const tours = [makeTour({ id: '1', name: 'Alpine Hike' })]
      const { filteredTours, searchQuery } = setup(tours)
      searchQuery.value = '   '
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should match tour name case-insensitively', () => {
      const tours = [makeTour({ id: '1', name: 'Alpine Hike' })]
      const { filteredTours, searchQuery } = setup(tours)
      searchQuery.value = 'alpine'
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should match partial tour name', () => {
      const tours = [
        makeTour({ id: '1', name: 'Alpine Hike' }),
        makeTour({ id: '2', name: 'Ski Tour' }),
      ]
      const { filteredTours, searchQuery } = setup(tours)
      searchQuery.value = 'ski'
      expect(filteredTours.value).toHaveLength(1)
      expect(filteredTours.value[0]!.id).toBe('2')
    })

    it('should find a tour by the grade its row shows, a grade-less one not', () => {
      const tours = [makeTour({ id: '1', name: 'Hike', grade: 'T3, S2' }), makeTour({ id: '2', name: 'Walk' })]
      const { filteredTours, searchQuery } = setup(tours)
      searchQuery.value = 's2'
      expect(filteredTours.value.map(t => t.id)).toEqual(['1'])
    })

    it('should match partner display name', () => {
      const tours = [makeTour({ id: '1', name: 'Hike', partnerIds: ['c-1'] })]
      const contacts = [{ id: 'c-1', firstName: 'Anna', lastName: 'Meier', displayName: 'Annie' }]
      const { filteredTours, searchQuery } = setup(tours, contacts)
      searchQuery.value = 'annie'
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should match partner full name when no display name', () => {
      const tours = [makeTour({ id: '1', name: 'Hike', partnerIds: ['c-1'] })]
      const contacts = [{ id: 'c-1', firstName: 'Bob', lastName: 'Müller', displayName: null }]
      const { filteredTours, searchQuery } = setup(tours, contacts)
      searchQuery.value = 'müller'
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should not match unnamed tour by name search', () => {
      const tours = [makeTour({ id: '1', name: null, partnerIds: [] })]
      const { filteredTours, searchQuery } = setup(tours)
      searchQuery.value = 'alpine'
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should match unnamed tour via partner name', () => {
      const tours = [makeTour({ id: '1', name: null, partnerIds: ['c-1'] })]
      const contacts = [{ id: 'c-1', firstName: 'Anna', lastName: null, displayName: null }]
      const { filteredTours, searchQuery } = setup(tours, contacts)
      searchQuery.value = 'anna'
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should treat missing contact as empty string without error', () => {
      const tours = [makeTour({ id: '1', name: null, partnerIds: ['ghost-id'] })]
      const { filteredTours, searchQuery } = setup(tours)
      searchQuery.value = 'ghost'
      expect(filteredTours.value).toHaveLength(0)
    })
  })

  // The Friends tab renders "by <contact name>", so that name must be searchable from the
  // SAME source the row displays — otherwise search shows a visible field nothing matches.
  describe('friend-owner search', () => {
    const PHONE = '+41791111111'

    function setupFriends(ownerContactName: string | null) {
      // stubActions:false + a call-through spy — the resolver must run through the REAL
      // findContactByMethodValue, which is what normalizes both sides of the phone match.
      setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }))
      const friends = useTourFilters('friends')
      friends.clearAll()
      const toursStore = useToursStore()
      const contactsStore = useContactsStore()
      const friendshipsStore = useFriendshipsStore()
      toursStore.friendTours = [
        makeTour({ id: 'f-1', name: 'Ridge', userId: 'owner-1', isFriendTour: true }),
      ] as any
      friendshipsStore.userIdToPhoneMap = new Map([['owner-1', PHONE]])
      contactsStore.contacts = ownerContactName
        ? ([{
            id: 'c-owner',
            firstName: ownerContactName,
            lastName: null,
            displayName: null,
            contactMethods: [{ id: 'm1', methodType: 'phone', value: PHONE, isPrimary: true }],
          }] as any)
        : []
      return friends
    }

    it('matches a friend tour by the owner\'s contact name', () => {
      const { filteredTours, searchQuery } = setupFriends('Mum')
      searchQuery.value = 'mum'
      expect(filteredTours.value).toHaveLength(1)
    })

    it('does not match by the owner\'s profile name when no contact resolves', () => {
      // Profile name is not a source anywhere in this change — an owner with no contact
      // is unsearchable rather than findable under a name the row never displays.
      const { filteredTours, searchQuery } = setupFriends(null)
      searchQuery.value = 'mum'
      expect(filteredTours.value).toHaveLength(0)
    })
  })

  describe('partner filter', () => {
    it('should include tour when partnerIds intersect filter', () => {
      const tours = [makeTour({ id: '1', partnerIds: ['c-1', 'c-2'] })]
      const { filteredTours, filters } = setup(tours)
      filters.partnerIds = new Set(['c-1'])
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should exclude tour when no partnerIds intersect filter', () => {
      const tours = [makeTour({ id: '1', partnerIds: ['c-2'] })]
      const { filteredTours, filters } = setup(tours)
      filters.partnerIds = new Set(['c-1'])
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should pass all tours when partner filter is empty', () => {
      const tours = [makeTour({ id: '1', partnerIds: [] })]
      const { filteredTours } = setup(tours)
      expect(filteredTours.value).toHaveLength(1)
    })
  })

  describe('activity-type filter', () => {
    it('should include tour matching its type', () => {
      const tours = [makeTour({ id: '1', tourTypes: ['hiking'] })]
      const { filteredTours, filters } = setup(tours)
      filters.tourTypes = new Set(['hiking'])
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should exclude tour with a different type', () => {
      const tours = [makeTour({ id: '1', tourTypes: ['skiing'] })]
      const { filteredTours, filters } = setup(tours)
      filters.tourTypes = new Set(['hiking'])
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should exclude an untyped tour when filter is active', () => {
      const tours = [makeTour({ id: '1', tourTypes: [] })]
      const { filteredTours, filters } = setup(tours)
      filters.tourTypes = new Set(['hiking'])
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should include a multi-activity tour when any of its types is selected', () => {
      const tours = [makeTour({ id: '1', tourTypes: ['skitour', 'hiking'] })]
      const { filteredTours, filters } = setup(tours)
      filters.tourTypes = new Set(['hiking'])
      expect(filteredTours.value).toHaveLength(1)
    })
  })

  describe('season filter', () => {
    it('should include tour when seasons intersect', () => {
      const tours = [makeTour({ id: '1', seasons: ['summer', 'autumn'] })]
      const { filteredTours, filters } = setup(tours)
      filters.seasons = new Set(['summer'])
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should exclude tour when seasons do not intersect', () => {
      const tours = [makeTour({ id: '1', seasons: ['winter'] })]
      const { filteredTours, filters } = setup(tours)
      filters.seasons = new Set(['summer'])
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should exclude tour with null seasons when filter is active', () => {
      const tours = [makeTour({ id: '1', seasons: null })]
      const { filteredTours, filters } = setup(tours)
      filters.seasons = new Set(['summer'])
      expect(filteredTours.value).toHaveLength(0)
    })
  })

  describe('planned-date filter', () => {
    it('should include tour within date range', () => {
      const tours = [makeTour({ id: '1', plannedDate: new Date('2024-06-15') })]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.from = new Date('2024-06-01')
      filters.dateRange.to = new Date('2024-06-30')
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should exclude tour before from date', () => {
      const tours = [makeTour({ id: '1', plannedDate: new Date('2024-05-01') })]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.from = new Date('2024-06-01')
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should exclude tour after to date', () => {
      const tours = [makeTour({ id: '1', plannedDate: new Date('2024-07-01') })]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.to = new Date('2024-06-30')
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should exclude tour with null plannedDate when bound is set', () => {
      const tours = [makeTour({ id: '1', plannedDate: null })]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.from = new Date('2024-06-01')
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should include tour with null plannedDate when no bounds', () => {
      const tours = [makeTour({ id: '1', plannedDate: null })]
      const { filteredTours } = setup(tours)
      expect(filteredTours.value).toHaveLength(1)
    })

    // Overlap, not start-date containment: "what's happening next week" must find a tour
    // that started the Friday before.
    it('should include a span straddling the from bound (start before it, end inside)', () => {
      const tours = [
        makeTour({
          id: '1',
          plannedDate: new Date('2024-06-15'),
          endDate: new Date('2024-06-18'),
        }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.from = new Date('2024-06-17')
      filters.dateRange.to = new Date('2024-06-30')
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should include a span straddling the to bound (start inside, end after)', () => {
      const tours = [
        makeTour({
          id: '1',
          plannedDate: new Date('2024-06-29'),
          endDate: new Date('2024-07-04'),
        }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.to = new Date('2024-06-30')
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should include a span that fully contains the filter range', () => {
      const tours = [
        makeTour({
          id: '1',
          plannedDate: new Date('2024-06-01'),
          endDate: new Date('2024-06-30'),
        }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.from = new Date('2024-06-10')
      filters.dateRange.to = new Date('2024-06-12')
      expect(filteredTours.value).toHaveLength(1)
    })

    it('should exclude a span that ends before the from bound', () => {
      const tours = [
        makeTour({
          id: '1',
          plannedDate: new Date('2024-06-01'),
          endDate: new Date('2024-06-03'),
        }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.from = new Date('2024-06-26')
      filters.dateRange.to = new Date('2024-06-30')
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should exclude a span that starts after the to bound', () => {
      const tours = [
        makeTour({
          id: '1',
          plannedDate: new Date('2024-07-05'),
          endDate: new Date('2024-07-09'),
        }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.to = new Date('2024-06-30')
      expect(filteredTours.value).toHaveLength(0)
    })

    it('should exclude an undated tour regardless of its endDate', () => {
      const tours = [
        makeTour({ id: '1', plannedDate: null, endDate: new Date('2024-06-20') }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.dateRange.from = new Date('2024-06-01')
      expect(filteredTours.value).toHaveLength(0)
    })
  })

  describe('completion filter', () => {
    it('should include all tours when completion is "all"', () => {
      const tours = [
        makeTour({ id: '1', completed: true }),
        makeTour({ id: '2', completed: false }),
      ]
      const { filteredTours } = setup(tours)
      expect(filteredTours.value).toHaveLength(2)
    })

    it('should include only completed tours when completion is "done"', () => {
      const tours = [
        makeTour({ id: '1', completed: true }),
        makeTour({ id: '2', completed: false }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.completion = 'done'
      expect(filteredTours.value).toHaveLength(1)
      expect(filteredTours.value[0]!.id).toBe('1')
    })

    it('should include only incomplete tours when completion is "open"', () => {
      const tours = [
        makeTour({ id: '1', completed: true }),
        makeTour({ id: '2', completed: false }),
      ]
      const { filteredTours, filters } = setup(tours)
      filters.completion = 'open'
      expect(filteredTours.value).toHaveLength(1)
      expect(filteredTours.value[0]!.id).toBe('2')
    })
  })

  describe('combined search and filters', () => {
    it('should apply both search and filters together', () => {
      const tours = [
        makeTour({ id: '1', name: 'Alpine Hike', tourTypes: ['hiking'], completed: false }),
        makeTour({ id: '2', name: 'Alpine Ski', tourTypes: ['skiing'], completed: false }),
      ]
      const { filteredTours, searchQuery, filters } = setup(tours)
      searchQuery.value = 'alpine'
      filters.tourTypes = new Set(['hiking'])
      expect(filteredTours.value).toHaveLength(1)
      expect(filteredTours.value[0]!.id).toBe('1')
    })
  })

  describe('friends-tab recorded-by filter', () => {
    function setupFriends(friendTours: Tour[]) {
      useToursStore().friendTours = friendTours as any
      const friends = useTourFilters('friends')
      friends.clearAll()
      return friends
    }

    it('should keep only the selected friends\' tours and count as one filter', () => {
      const { filteredTours, filters, activeFilterCount } = setupFriends([
        makeTour({ id: 'f-1', userId: 'u-lena', isFriendTour: true }),
        makeTour({ id: 'f-2', userId: 'u-tom', isFriendTour: true }),
      ])
      filters.ownerIds = new Set(['u-lena'])
      expect(filteredTours.value.map(t => t.id)).toEqual(['f-1'])
      expect(activeFilterCount.value).toBe(1)
    })
  })

  describe('grade filter', () => {
    it('should drop ungraded and free-text tours once a grade is picked, and count grades once', () => {
      const tours = [
        makeTour({ id: '1', grade: 'T3' }),
        makeTour({ id: '2', grade: null }),
        makeTour({ id: '3', grade: '5c' }),
        makeTour({ id: '4', grade: 'S1' }),
      ]
      const { filteredTours, filters, activeFilterCount } = setup(tours)
      filters.grades = new Set(['T1', 'T3', 'S0'])
      expect(filteredTours.value.map(t => t.id)).toEqual(['1'])
      expect(activeFilterCount.value).toBe(1)
    })

    it('should be cleared by clearFilters', () => {
      const { filters, clearFilters, activeFilterCount } = setup([])
      filters.grades = new Set(['T3'])
      filters.ownerIds = new Set(['u-1'])
      clearFilters()
      expect(activeFilterCount.value).toBe(0)
    })
  })

  describe('useListedTourIds', () => {
    it('should be null while nothing narrows, even with tours loaded', () => {
      setup([makeTour({ id: '1' })])
      expect(useListedTourIds().value).toBeNull()
    })

    it('should keep every segment of an outing one segment matched', () => {
      const outing = (position: number) => ({ id: 'o-1', name: 'Haute Route', position })
      const tours = [
        makeTour({ id: 's-1', grade: 'T2', outing: outing(0) }),
        makeTour({ id: 's-2', grade: 'T5', outing: outing(1) }),
        makeTour({ id: 'x', grade: 'T5' }),
      ]
      const { filters } = setup(tours)
      useActiveTourTab().value = 'owned'
      filters.grades = new Set(['T2'])
      expect([...useListedTourIds().value!].sort()).toEqual(['s-1', 's-2'])
    })

    it('should follow the active tab, not the one that holds filters', () => {
      const { filters } = setup([makeTour({ id: '1', grade: 'T5' })])
      filters.grades = new Set(['T3'])
      const tab = useActiveTourTab()
      tab.value = 'friends'
      expect(useListedTourIds().value).toBeNull()
      tab.value = 'owned'
    })
  })

  describe('showFriendTours', () => {
    it('should drop earlier search and filters on both tabs and narrow Friends to that friend', () => {
      const owned = setup([])
      const friends = useTourFilters('friends')
      owned.searchQuery.value = 'piz'
      friends.searchQuery.value = 'ridge'
      friends.filters.completion = 'done'

      showFriendTours('u-lena')

      expect(useActiveTourTab().value).toBe('friends')
      expect([owned.searchQuery.value, friends.searchQuery.value]).toEqual(['', ''])
      expect([...friends.filters.ownerIds]).toEqual(['u-lena'])
      expect(friends.activeFilterCount.value).toBe(1)
      friends.clearAll()
      useActiveTourTab().value = 'owned'
    })
  })

  describe('activeFilterCount', () => {
    it('should be 0 when no filters active', () => {
      const { activeFilterCount } = setup([])
      expect(activeFilterCount.value).toBe(0)
    })

    it('should count partner filter as 1', () => {
      const { activeFilterCount, filters } = setup([])
      filters.partnerIds = new Set(['c-1'])
      expect(activeFilterCount.value).toBe(1)
    })

    it('should count two active filter categories as 2', () => {
      const { activeFilterCount, filters } = setup([])
      filters.partnerIds = new Set(['c-1'])
      filters.completion = 'done'
      expect(activeFilterCount.value).toBe(2)
    })

    it('should not count search in activeFilterCount', () => {
      const { activeFilterCount, searchQuery } = setup([])
      searchQuery.value = 'test'
      expect(activeFilterCount.value).toBe(0)
    })
  })

  describe('clearAll', () => {
    it('should reset search and all filters', () => {
      const tours = [makeTour({ id: '1', name: 'Hike', tourTypes: ['hiking'] })]
      const { filteredTours, searchQuery, filters, activeFilterCount, clearAll } = setup(tours)
      searchQuery.value = 'xyz'
      filters.tourTypes = new Set(['skiing'])
      filters.completion = 'done'
      expect(filteredTours.value).toHaveLength(0)
      clearAll()
      expect(searchQuery.value).toBe('')
      expect(activeFilterCount.value).toBe(0)
      expect(filteredTours.value).toHaveLength(1)
    })
  })

  describe('clearFilters', () => {
    it('should reset every facet but keep the search query', () => {
      const tours = [makeTour({ id: '1', name: 'Hike', tourTypes: ['hiking'] })]
      const { searchQuery, filters, activeFilterCount, clearFilters } = setup(tours)
      searchQuery.value = 'hike'
      filters.partnerIds = new Set(['c-1'])
      filters.tourTypes = new Set(['skiing'])
      filters.seasons = new Set(['winter'])
      filters.dateRange.from = new Date('2026-01-01')
      filters.dateRange.to = new Date('2026-02-01')
      filters.completion = 'done'

      clearFilters()

      expect(activeFilterCount.value).toBe(0)
      expect(filters.dateRange).toEqual({ from: null, to: null })
      expect(searchQuery.value).toBe('hike')
    })

    it('should not touch the other tab state', () => {
      const owned = setup([])
      const friends = useTourFilters('friends')
      friends.filters.completion = 'done'
      owned.filters.completion = 'open'

      owned.clearFilters()

      expect(friends.activeFilterCount.value).toBe(1)
      friends.clearAll()
    })
  })
})
