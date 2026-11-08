import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import BottomSheet from '@/core/components/bottom-sheet.vue'
import TourListSheet from '@/features/tours/presentation/components/tour-list-sheet.vue'
import { resetTourFilters, useActiveTourTab, useTourFilters } from '@/features/tours/presentation/composables/use-tour-filters'

// Desktop by default (happy-dom matchMedia); the sheet-height test flips to mobile.
const isDesktop = ref(true)
vi.mock('@/core/composables/use-is-desktop', () => ({ useIsDesktop: () => isDesktop }))

const mockTours = [
  {
    id: 't-1',
    userId: 'u-1',
    name: 'Alpine Hike',
    plannedDate: new Date('2024-06-15'),
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
  },
  {
    id: 't-2',
    userId: 'u-1',
    name: 'Ski Tour',
    plannedDate: null,
    goal: { lng: 8.6, lat: 47.6 },
    partnerIds: [],
    tourTypes: ['skiing'],
    elevation: 2000,
    gpxFilepath: null,
    description: null,
    seasons: ['winter'],
    startPoint: null,
    endPoint: null,
    equipment: null,
    notes: null,
    completed: true,
  },
]

function mountSheet(
  options: {
    /** Seeds the store state as-is; rows may break the Tour type (e.g. a null name). */
    tours?: unknown[]
    friendTours?: unknown[]
    isLoading?: boolean
    isAuthenticated?: boolean
    /** Needed for focus assertions — focus() is a no-op on a detached tree. */
    attachTo?: HTMLElement
  } = {},
) {
  return mount(TourListSheet, {
    attachTo: options.attachTo,
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: {
            tours: {
              tours: options.tours ?? mockTours,
              friendTours: options.friendTours ?? [],
              isLoading: options.isLoading ?? false,
              error: null,
            },
            contacts: { contacts: [], isLoading: false, error: null },
            map: { selectedTourId: null, isPickingLocation: false },
            auth: { currentUser: (options.isAuthenticated ?? true) ? { id: 'u-1' } : null },
          },
        }),
      ],
    },
  })
}

describe('tourListSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('list with tours', () => {
    it('should render one row per tour', () => {
      const wrapper = mountSheet()
      expect(wrapper.findAll('.tour-row')).toHaveLength(2)
    })

    it('should display tour names in rows', () => {
      const wrapper = mountSheet()
      const rows = wrapper.findAll('.tour-row')
      expect(rows[0]!.text()).toContain('Alpine Hike')
      expect(rows[1]!.text()).toContain('Ski Tour')
    })

    it('should display the unnamed-tour fallback for tours with null name', () => {
      const tours = [{ ...mockTours[0]!, id: 't-3', name: null }]
      const wrapper = mountSheet({ tours })
      // i18n stub echoes keys; the row falls back to the unnamed-tour label.
      expect(wrapper.find('.tour-row').text()).toContain('tours.infoSheet.unnamedTour')
    })
  })

  describe('loading state', () => {
    it('should show loading text when isLoading and no tours', () => {
      const wrapper = mountSheet({ tours: [], isLoading: true })
      expect(wrapper.find('.loading-text').exists()).toBe(true)
    })
  })

  describe('empty state — no tours', () => {
    it('should show empty state when tours array is empty and not loading', () => {
      const wrapper = mountSheet({ tours: [] })
      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.find('.empty-state').text()).toContain('tours.list.emptyTitle')
    })
  })

  describe('sheet height while searching', () => {
    it('should hold the sheet height only while a search query is active', async () => {
      isDesktop.value = false
      const wrapper = mountSheet()
      const sheet = () => wrapper.findComponent(BottomSheet)
      expect(sheet().props('holdHeight')).toBe(false)
      await wrapper.find('.search-input').setValue('alp')
      expect(sheet().props('holdHeight')).toBe(true)
      await wrapper.find('.search-input').setValue('   ')
      expect(sheet().props('holdHeight')).toBe(false)
      isDesktop.value = true
    })

    // Open, the filters size the sheet on their own (opening at 70%, draggable to 90%); closed
    // with nothing selected, the sheet fits the rows again.
    it('should size the sheet for the filters while open, and release it on collapse', async () => {
      isDesktop.value = false
      const wrapper = mountSheet()
      const sheet = () => wrapper.findComponent(BottomSheet)
      await wrapper.find('.filters-trigger').trigger('click')
      expect(sheet().props()).toMatchObject({ holdHeight: true, resizable: false })
      await wrapper.find('.filters-trigger').trigger('click')
      expect(sheet().props()).toMatchObject({ holdHeight: false, resizable: true })
      isDesktop.value = true
    })
  })

  describe('filtered empty state', () => {
    it('should show filtered empty state when search yields no results', async () => {
      const wrapper = mountSheet()
      await wrapper.find('.search-input').setValue('xyznotfound')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.empty-state').exists()).toBe(true)
      expect(wrapper.find('.empty-state').text()).toContain('tours.list.noMatchesTitle')
    })

    it('should clear filters and show list when "Clear filters" clicked', async () => {
      const wrapper = mountSheet()
      await wrapper.find('.search-input').setValue('xyznotfound')
      await wrapper.vm.$nextTick()
      await wrapper.find('.base-button--primary').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.tour-row')).toHaveLength(2)
    })
  })

  describe('row click', () => {
    it('should emit selectTour with tour id when row clicked', async () => {
      const wrapper = mountSheet()
      await wrapper.findAll('.tour-row')[0]!.trigger('click')
      expect(wrapper.emitted('selectTour')).toHaveLength(1)
      expect(wrapper.emitted('selectTour')![0]).toEqual(['t-1'])
    })
  })

  describe('header add-tour button', () => {
    it('should render the header add-tour button when authenticated', () => {
      const wrapper = mountSheet({ isAuthenticated: true })
      expect(wrapper.find('[data-testid="header-add-tour"]').exists()).toBe(true)
    })

    it('should render header button enabled when authenticated (click enabled = can emit)', () => {
      const wrapper = mountSheet({ isAuthenticated: true })
      const btn = wrapper.find('[data-testid="header-add-tour"]')
      expect(btn.exists()).toBe(true)
      expect(btn.attributes('disabled')).toBeUndefined()
    })

    it('should render header button disabled when unauthenticated', () => {
      const wrapper = mountSheet({ isAuthenticated: false })
      expect(wrapper.find('[data-testid="header-add-tour"]').attributes('disabled')).toBeDefined()
    })
  })

  describe('filters trigger', () => {
    it('should show filters panel when trigger clicked', async () => {
      const wrapper = mountSheet()
      expect(wrapper.findComponent({ name: 'TourFiltersPanel' }).exists()).toBe(false)
      await wrapper.find('.filters-trigger').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.findComponent({ name: 'TourFiltersPanel' }).exists()).toBe(true)
    })

    it('should show active filter count badge', async () => {
      const wrapper = mountSheet()
      await wrapper.find('.filters-trigger').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.filter-badge').exists()).toBe(false)
    })
  })

  describe('filters view', () => {
    // Filter state is module-level in the composable, so it survives unmount —
    // reset it or the assertions below leak into neighbouring tests.
    afterEach(() => resetTourFilters())

    async function openFilters(options: Parameters<typeof mountSheet>[0] = {}) {
      const wrapper = mountSheet(options)
      await wrapper.find('.filters-trigger').trigger('click')
      return wrapper
    }
    const resetBtn = (w: ReturnType<typeof mountSheet>) => w.find('[data-testid="clear-filters"]')

    it('should take the rows\' place, so a thinning list can never squeeze the filters', async () => {
      const wrapper = await openFilters()
      wrapper.findComponent({ name: 'TourFiltersPanel' }).vm.$emit('update:completion', 'done')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.tours-scroll').attributes('style')).toContain('display: none')
      expect(wrapper.findComponent({ name: 'TourFiltersPanel' }).exists()).toBe(true)
      wrapper.unmount()
    })

    it('should keep reset in place but disabled while no facet is active', async () => {
      const wrapper = await openFilters()
      expect(resetBtn(wrapper).attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('should reset the facets but leave the search query', async () => {
      const wrapper = await openFilters()
      wrapper.findComponent({ name: 'TourFiltersPanel' }).vm.$emit('update:completion', 'done')
      await wrapper.find('.search-input').setValue('Alpine')
      await resetBtn(wrapper).trigger('click')
      await wrapper.find('[data-testid="show-results"]').trigger('click')

      expect((wrapper.find('.search-input').element as HTMLInputElement).value).toBe('Alpine')
      // Search survived, so only the matching tour is listed.
      expect(wrapper.findAll('.tour-row')).toHaveLength(1)
      wrapper.unmount()
    })

    it('should collapse when Escape is pressed from the search input', async () => {
      const wrapper = await openFilters()
      await wrapper.find('.search-input').trigger('keydown.escape')
      expect(wrapper.findComponent({ name: 'TourFiltersPanel' }).exists()).toBe(false)
      wrapper.unmount()
    })

    it('should stay open through a pointer outside — dragging the sheet must not close it', async () => {
      const wrapper = await openFilters()
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await wrapper.vm.$nextTick()
      expect(wrapper.findComponent({ name: 'TourFiltersPanel' }).exists()).toBe(true)
      wrapper.unmount()
    })

    it('should return focus to the trigger when dismissed', async () => {
      const wrapper = await openFilters({ attachTo: document.body })
      await wrapper.find('[data-testid="show-results"]').trigger('click')
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      expect(document.activeElement).toBe(wrapper.find('.filters-trigger').element)
      wrapper.unmount()
    })
  })

  // The map marks only friend tours the viewer partners on; a narrowed Friends list says so.
  describe('friends on the map note', () => {
    const friendTour = (id: string, isPartner: boolean) =>
      ({ ...mockTours[0]!, id, userId: 'u-lena', isFriendTour: true, isPartner, partnerNames: [] })

    async function friendsNarrowedTo(friendTours: unknown[]) {
      useActiveTourTab().value = 'friends'
      const wrapper = mountSheet({ friendTours })
      useTourFilters('friends').filters.ownerIds = new Set(['u-lena'])
      await wrapper.vm.$nextTick()
      return wrapper
    }

    afterEach(() => {
      resetTourFilters()
      useActiveTourTab().value = 'owned'
    })

    it('should say when the map marks fewer of the listed friend tours', async () => {
      const wrapper = await friendsNarrowedTo([friendTour('f-1', true), friendTour('f-2', false)])
      expect(wrapper.find('[data-testid="friends-on-map"]').exists()).toBe(true)
      wrapper.unmount()
    })

    it('should stay silent when every listed friend tour is marked, or nothing narrows', async () => {
      const wrapper = await friendsNarrowedTo([friendTour('f-1', true)])
      expect(wrapper.find('[data-testid="friends-on-map"]').exists()).toBe(false)
      resetTourFilters()
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="friends-on-map"]').exists()).toBe(false)
      wrapper.unmount()
    })
  })

  describe('per-tab filter isolation', () => {
    it('should leave the other tab facets untouched when clearing', async () => {
      const wrapper = mountSheet()
      await wrapper.find('.filters-trigger').trigger('click')
      wrapper.findComponent({ name: 'TourFiltersPanel' }).vm.$emit('update:completion', 'done')
      await wrapper.vm.$nextTick()

      await wrapper.findAll('.tab')[1].trigger('click')
      wrapper.findComponent({ name: 'TourFiltersPanel' }).vm.$emit('update:completion', 'open')
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="clear-filters"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="clear-filters"]').attributes('disabled')).toBeDefined()

      // Owned kept its own facet through the friends-tab clear.
      await wrapper.findAll('.tab')[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="clear-filters"]').attributes('disabled')).toBeUndefined()

      // Filter state is module-level — reset or it leaks into neighbouring tests.
      await wrapper.find('[data-testid="clear-filters"]').trigger('click')
      wrapper.unmount()
    })
  })

  describe('backfill header button', () => {
    it('should not render on the owned tab', () => {
      const wrapper = mountSheet()
      expect(wrapper.find('[data-testid="header-backfill"]').exists()).toBe(false)
      wrapper.unmount()
    })

    it('should not render on the friends tab without friendships', async () => {
      const wrapper = mountSheet()
      await wrapper.findAll('.tab')[1].trigger('click')

      expect(wrapper.find('[data-testid="header-backfill"]').exists()).toBe(false)
      wrapper.unmount()
    })
  })
})

describe('tourListSheet — outings (#338)', () => {
  const outing = (position: number) => ({ id: 'o1', name: 'Haute Route', position })
  const tours = [
    { ...mockTours[0]!, id: 's-1', name: 'Valley to hut', outing: outing(0) },
    { ...mockTours[1]!, id: 'solo', name: 'Solo' },
    { ...mockTours[0]!, id: 's-2', name: 'Hut to summit', tourTypes: ['paragliding'], outing: outing(1) },
  ]

  beforeEach(async () => {
    const { resetTourFilters, useActiveTourTab } = await import('@/features/tours/presentation/composables/use-tour-filters')
    resetTourFilters()
    useActiveTourTab().value = 'owned'
  })

  it('should fold an outing\'s segments into one row where its first segment was', () => {
    const wrapper = mountSheet({ tours })
    const rows = wrapper.findAll('.tour-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.attributes('data-testid')).toBe('outing-row')
    expect(rows[0]!.text()).toContain('Haute Route')
  })

  it('should open the outing from its row', async () => {
    const wrapper = mountSheet({ tours })
    await wrapper.find('[data-testid="outing-row"]').trigger('click')
    expect(wrapper.emitted('selectOuting')).toEqual([['u-1/o1']])
  })

  it('should find the outing by its name even when no segment name matches', async () => {
    const wrapper = mountSheet({ tours })
    await wrapper.find('.search-input').setValue('haute')
    expect(wrapper.findAll('.tour-row').map(r => r.attributes('data-testid'))).toEqual(['outing-row'])
  })
})
