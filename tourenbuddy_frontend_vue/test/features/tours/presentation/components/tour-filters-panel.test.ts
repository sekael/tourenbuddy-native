import type { TourFilters } from '@/features/tours/presentation/composables/use-tour-filters'
import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TourFiltersPanel from '@/features/tours/presentation/components/tour-filters-panel.vue'
import { TOUR_FILL } from '../../../../fixtures/tour-fill'

// The tours store kicks a friend-tour load when signed in: keep it pending, off the network,
// so it never overwrites the seeded friend tours.
vi.mock('@/features/tours/data/repositories/tours-repository-impl', () => ({
  ToursRepositoryImpl: vi.fn().mockImplementation(() => ({ listFriendTours: () => new Promise(() => {}) })),
}))

const tour = (over: Record<string, unknown>) => ({ ...TOUR_FILL, id: 't', userId: 'u-me', name: 'T', goal: { lng: 8, lat: 46 }, partnerIds: [], tourTypes: [], completed: false, ...over })

function filters(over: Partial<TourFilters> = {}): TourFilters {
  return {
    partnerIds: new Set(),
    ownerIds: new Set(),
    tourTypes: new Set(),
    grades: new Set(),
    seasons: new Set(),
    dateRange: { from: null, to: null },
    completion: 'all',
    ...over,
  }
}

function mountPanel(opts: { tab: 'owned' | 'friends', tours?: unknown[], friendTours?: unknown[], filters?: TourFilters, contactsLoaded?: boolean }) {
  return mount(TourFiltersPanel, {
    props: { filters: opts.filters ?? filters(), tab: opts.tab, tours: (opts.tours ?? []) as any },
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        initialState: {
          tours: { tours: [], friendTours: opts.friendTours ?? [] },
          contacts: { contacts: [{ id: 'c-1', firstName: 'Ana', lastName: null, displayName: null, contactMethods: [] }], hasLoaded: opts.contactsLoaded ?? true },
        },
      })],
    },
  })
}

function chipTexts(wrapper: ReturnType<typeof mountPanel>, testid: string) {
  return wrapper.find(`[data-testid="${testid}"]`).findAll('button').map(b => b.text())
}

describe('tourFiltersPanel', () => {
  describe('friends-tab people', () => {
    const friendTours = [
      tour({ id: 'f-1', userId: 'u-zoe', isFriendTour: true, partnerNames: [{ userId: 'u-bea', firstName: 'Bea', lastName: 'K' }, { userId: 'u-me', firstName: 'Me', lastName: null }] }),
      tour({ id: 'f-2', userId: 'u-amy', isFriendTour: true, partnerNames: [] }),
    ]

    it('should hold the recorded-by chips until names settle, keeping the group in place', async () => {
      const wrapper = mountPanel({ tab: 'friends', friendTours, contactsLoaded: false })
      await flushPromises()
      expect(wrapper.find('[data-testid="owner-filter"]').exists()).toBe(true)
      expect(chipTexts(wrapper, 'owner-filter')).toEqual([])
    })

    it('should offer no partner filter on Friends, only recorded-by', async () => {
      const wrapper = mountPanel({ tab: 'friends', friendTours })
      await flushPromises()
      expect(wrapper.find('[data-testid="partner-filter"]').exists()).toBe(false)
      expect(chipTexts(wrapper, 'owner-filter')).toHaveLength(2)
    })

    it('should keep a selected friend with no tours offered and lit, so it can be cleared', async () => {
      const wrapper = mountPanel({ tab: 'friends', friendTours: [], filters: filters({ ownerIds: new Set(['u-lena']) }) })
      await flushPromises()
      const chip = wrapper.find('[data-testid="owner-filter"] button')
      expect(chip.attributes('aria-pressed')).toBe('true')
      await chip.trigger('click')
      expect([...(wrapper.emitted('update:ownerIds')![0]![0] as Set<string>)]).toEqual([])
    })

    it('should offer no recorded-by filter on My Tours, and contacts as partners there', async () => {
      const wrapper = mountPanel({ tab: 'owned', friendTours })
      await flushPromises()
      expect(wrapper.find('[data-testid="owner-filter"]').exists()).toBe(false)
      expect(chipTexts(wrapper, 'partner-filter')).toEqual(['Ana'])
    })
  })

  describe('grade', () => {
    it('should hide the grade filter when no tour carries a closed-scale grade', () => {
      const wrapper = mountPanel({ tab: 'owned', tours: [tour({ grade: '5c' }), tour({ grade: null })] })
      expect(wrapper.find('[data-testid="grade-filter"]').exists()).toBe(false)
    })

    it('should offer only scales in use, plus a scale still holding a selected grade', () => {
      const wrapper = mountPanel({
        tab: 'owned',
        tours: [tour({ grade: 'T3' })],
        filters: filters({ grades: new Set(['S1', 'S3']) }),
      })
      const rows = wrapper.find('[data-testid="grade-filter"]').findAll('[role="group"]')
      expect(rows.map(r => r.findAll('button')[0]!.text())).toEqual(['T1', 'S0'])
      expect(rows[1]!.findAll('button[aria-pressed="true"]').map(b => b.text())).toEqual(['S1', 'S3'])
    })

    it('should add a tapped grade to the others and remove a lit one (no range)', async () => {
      const wrapper = mountPanel({ tab: 'owned', tours: [tour({ grade: 'T3' })], filters: filters({ grades: new Set(['T4']) }) })
      const chip = (g: string) => wrapper.findAll('[data-testid="grade-filter"] button').find(b => b.text() === g)!
      await chip('T2').trigger('click')
      await chip('T4').trigger('click')
      const [added, removed] = wrapper.emitted('update:grades')!.map(e => [...(e[0] as Set<string>)])
      expect(added).toEqual(['T4', 'T2'])
      expect(removed).toEqual([])
    })
  })
})
