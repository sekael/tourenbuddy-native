import type { VueWrapper } from '@vue/test-utils'
import type { ComponentPublicInstance } from 'vue'
import type { CreationStage } from '@/features/tours/presentation/composables/creation-stages'
import type { PointPick } from '@/features/tours/presentation/composables/use-swisstopo-fill'
import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { isOnline } from '@/core/offline/use-online-status'
import { fetchSkiRoute } from '@/features/map/data/services/swisstopo-trail-service'
import { ROUTE_ZOOM } from '@/features/map/presentation/composables/frame-tour'
import MapPage from '@/features/map/presentation/pages/map-page.vue'
import { useMapStore } from '@/features/map/presentation/stores/map-store'
import { useActiveTourTab, useTourFilters } from '@/features/tours/presentation/composables/use-tour-filters'
import { useToursStore } from '@/features/tours/presentation/stores/tours-store'
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store'

vi.mock('@/features/tours/data/services/swisstopo-elevation-service', () => ({
  getElevation: vi.fn().mockResolvedValue(1234),
}))
vi.mock('@/features/map/data/services/swisstopo-trail-service', () => ({
  fetchSkiRoute: vi.fn(),
  SkiRouteNotFoundError: class extends Error {},
}))
vi.mock('@/features/tours/data/services/swisstopo-name-service', () => ({
  suggestTourName: vi.fn().mockResolvedValue('Mocked Peak'),
}))

// No router is installed in the test harness, so mock vue-router to capture the
// back-navigation target (and no-op the route-leave guard).
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push }),
  onBeforeRouteLeave: vi.fn(),
}))

const TAP = { point: { x: 100, y: 100 }, lngLat: { lng: 8.4, lat: 46.8 } }
// Just enough MapLibre for the trail-lookup and tour-framing paths; `zoom` is set per test.
const fakeMap = {
  zoom: 13,
  getZoom: () => fakeMap.zoom,
  getBounds: () => ({ getWest: () => 8, getSouth: () => 46, getEast: () => 9, getNorth: () => 47 }),
  getContainer: () => ({ clientWidth: 400, clientHeight: 800, getBoundingClientRect: () => ({ width: 400, height: 800 }) }),
  project: () => ({ x: 0, y: 0 }),
  // One rendered ski route piece at screen (0, 0): a tap box containing it hits, others miss.
  getLayer: () => ({}),
  getSource: () => ({ tiles: ['https://data.test/ski-routes/v1/{z}/{x}/{y}.pbf'], setUrl: vi.fn() }),
  queryRenderedFeatures: ([[x0, y0], [x1, y1]]: [number, number][]) => x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0
    ? [{ properties: { id: 'r1' }, geometry: { type: 'LineString', coordinates: [[8.4, 46.8], [8.41, 46.81]] } }]
    : [],
  getBearing: () => 0,
  cameraForBounds: () => undefined,
  flyTo: vi.fn(),
  easeTo: vi.fn(),
  getCenter: () => ({ lng: 8.5, lat: 46.5 }),
  on: vi.fn(),
}
/** Camera moves of either kind: a short hop glides, a long one flies (D21). */
const cameraMoves = () => fakeMap.flyTo.mock.calls.length + fakeMap.easeTo.mock.calls.length

// Stubs for all heavy child components
const TourenbuddyMapStub = {
  name: 'TourenbuddyMap',
  template: '<div data-testid="map" />',
  props: ['covered', 'listedTourIds'],
  emits: ['tourClicked', 'mapBackgroundClick'],
  expose: ['map'],
  setup: () => ({ map: fakeMap }),
}
const TourInfoSheetStub = {
  name: 'TourInfoSheet',
  template: '<div data-testid="tour-info-sheet" />',
  emits: ['close', 'back'],
  props: ['tour'],
}
const FeedbackSheetStub = {
  name: 'FeedbackSheet',
  template: '<div data-testid="feedback-sheet" />',
  emits: ['close'],
}
const UserProfileSheetStub = {
  name: 'UserProfileSheet',
  template: '<div data-testid="profile-sheet" />',
  emits: ['close'],
}
const ContactsListSheetStub = {
  name: 'ContactsListSheet',
  template: '<div data-testid="contacts-sheet" />',
  emits: ['close', 'showFriendTours'],
}

const TourCreationDialogStub = {
  name: 'TourCreationDialog',
  template: '<div data-testid="tour-creation-dialog" />',
  props: ['stages', 'active', 'title', 'dayOffset', 'dayCount'],
  emits: ['confirm', 'close', 'pick-point', 'next-day', 'select', 'remove', 'stage-change', 'draw-track', 'handover-moved'],
}

const RoutePlannerStub = {
  name: 'RoutePlanner',
  template: '<div data-testid="route-planner" />',
  props: ['map', 'initial', 'step', 'title', 'doneLabel', 'routeHit', 'hint', 'track', 'fixedLine', 'tourTypes', 'days', 'day', 'canAddDay', 'follow', 'back'],
  emits: ['change', 'line', 'done', 'nextDay', 'selectDay', 'cancel', 'update:follow'],
}

const STUB_TOUR = {
  id: 'tour-1',
  name: 'Test Tour',
  goal: { lat: 46.8, lng: 8.2 },
  plannedDate: null,
  partnerIds: [],
  createdAt: new Date(),
}

// Speed-dial controls the page drives (e.g. the guided tour's staging).
const overlayMenu = { openMenu: vi.fn(), closeMenu: vi.fn(), openMapLayers: vi.fn() }

/** `<script setup>` state the tests drive directly; the page exposes none of it publicly. */
interface MapPageInternals {
  activeOverlay: string | null
  pendingPickType: 'goal' | 'start' | 'end'
  editPickedPoint: PointPick | null
  stages: CreationStage[]
  dayCount: number | null
  startNewTour: () => void
  handleSplitTour: (anchorId: string) => void
  tourDetailOrigin: 'list' | 'cal-seasons' | 'cal-planned' | null
  tourDetailOriginDay: string | null
  showCalendarFeatureNotice: boolean
  onboardingTour: { startTour: (step: number) => void, finish: () => void }
  openOverlay: (name: string) => void
  handleLocationConfirmed: (location: { lng: number, lat: number, name?: string }) => void
  handleTourCreated: (...args: unknown[]) => Promise<void>
  handleDialogClose: () => void
  dismissCalendarFeatureNotice: () => void
}

function mountMapPage(
  initialState = {},
  stubOverrides: Record<string, unknown> = {},
): VueWrapper<ComponentPublicInstance & MapPageInternals> {
  return mount(MapPage, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true, initialState })],
      stubs: {
        TourenbuddyMap: TourenbuddyMapStub,
        MapActionOverlay: {
          template: '<div />',
          expose: ['openMenu', 'closeMenu', 'openMapLayers'],
          setup: () => overlayMenu,
        },
        LocationPicker: { template: '<div />' },
        TourInfoSheet: TourInfoSheetStub,
        FeedbackSheet: FeedbackSheetStub,
        TourCreationDialog: TourCreationDialogStub,
        UserProfileSheet: UserProfileSheetStub,
        ContactsListSheet: ContactsListSheetStub,
        ...stubOverrides,
      },
    },
  }) as unknown as VueWrapper<ComponentPublicInstance & MapPageInternals>
}

describe('mapPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  describe('map background click dismissal', () => {
    it('should call selectTour(null) to close the tour info sheet on map-background-click', async () => {
      const wrapper = mountMapPage()
      const mapStore = useMapStore()
      const toursStore = useToursStore()

      toursStore.$patch({ tours: [STUB_TOUR] })
      mapStore.$patch({ selectedTourId: STUB_TOUR.id })
      wrapper.vm.activeOverlay = 'tour'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="tour-info-sheet"]').exists()).toBe(true)

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', TAP)
      await wrapper.vm.$nextTick()

      expect(mapStore.selectTour).toHaveBeenCalledWith(null)
    })

    it('should close the feedback sheet on map-background-click', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(true)

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', TAP)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(false)
    })

    it('should close the user profile sheet on map-background-click', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'profile'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="profile-sheet"]').exists()).toBe(true)

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', TAP)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="profile-sheet"]').exists()).toBe(false)
    })

    it('should close the active overlay on map-background-click', async () => {
      const wrapper = mountMapPage()
      const mapStore = useMapStore()

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', TAP)
      await wrapper.vm.$nextTick()

      expect(mapStore.selectTour).not.toHaveBeenCalledWith(null)
      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(false)
    })
  })

  describe('tour list search + filter reset', () => {
    it('should keep search + filters through a tour opened from the list, and reset once the list is left', async () => {
      const wrapper = mountMapPage({}, { TourListSheet: true })
      const owned = useTourFilters('owned')
      owned.searchQuery.value = 'piz'
      owned.filters.completion = 'open'

      for (const name of ['tours', 'tour', 'tours']) {
        wrapper.vm.activeOverlay = name
        await nextTick()
      }
      expect(owned.searchQuery.value).toBe('piz')
      expect(owned.filters.completion).toBe('open')

      wrapper.vm.activeOverlay = 'contacts'
      await nextTick()
      expect(owned.searchQuery.value).toBe('')
      expect(owned.filters.completion).toBe('all')
    })

    // #351: a filter that outlived the page (calendar round trip) must not thin a bare map.
    it('should narrow the map only while the list itself is open', async () => {
      const wrapper = mountMapPage({ tours: { tours: [{ ...STUB_TOUR, completed: false }] } }, { TourListSheet: true })
      const listed = () => wrapper.findComponent({ name: 'TourenbuddyMap' }).props('listedTourIds')
      useTourFilters('owned').filters.completion = 'done'
      await nextTick()
      expect(listed()).toBeNull()

      wrapper.vm.activeOverlay = 'tours'
      await nextTick()
      expect([...listed()]).toEqual([])

      wrapper.vm.activeOverlay = 'tour'
      await nextTick()
      expect(listed()).toBeNull()
    })

    it('should open a friend\'s tours from their contact on the Friends tab, filtered to them', async () => {
      const wrapper = mountMapPage({}, { TourListSheet: true })
      useTourFilters('friends').searchQuery.value = 'old query'
      wrapper.vm.openOverlay('contacts')
      await nextTick()

      await wrapper.findComponent({ name: 'ContactsListSheet' }).vm.$emit('showFriendTours', 'u-lena')
      await nextTick()

      expect(wrapper.vm.activeOverlay).toBe('tours')
      expect(useActiveTourTab().value).toBe('friends')
      expect(useTourFilters('friends').searchQuery.value).toBe('')
      expect([...useTourFilters('friends').filters.ownerIds]).toEqual(['u-lena'])
      useTourFilters('friends').clearAll()
      useActiveTourTab().value = 'owned'
    })
  })

  describe('ski route taps', () => {
    const skiOn = { map: { activeOverlays: ['ski'] } }
    const route = { name: null, targetName: 'Peak', targetAltitude: null, difficulty: null, ascentTime: null, ascentM: null, descentM: null, sacUrl: null }
    // fakeMap.project puts every vertex at (0, 0): a tap there hits, one far away misses.
    const trail = { overlay: 'ski', id: 'r1', lines: [[[8.4, 46.8], [8.41, 46.81]]], route }

    beforeEach(() => {
      fakeMap.zoom = 13
      isOnline.value = true
      vi.mocked(fetchSkiRoute).mockReset().mockResolvedValue(trail as never)
    })

    const tapAt = (x: number) => ({ ...TAP, point: { x, y: x } })

    it('should treat a tap below the marking zoom as a plain map tap, without lookup or message', async () => {
      fakeMap.zoom = 10.5
      const wrapper = mountMapPage(skiOn)

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', tapAt(0))
      await flushPromises()

      expect(fetchSkiRoute).not.toHaveBeenCalled()
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      expect(wrapper.vm.activeOverlay).toBeNull()
    })

    it('should explain an offline tap on a marked route instead of loading it', async () => {
      isOnline.value = false
      const wrapper = mountMapPage(skiOn)

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', tapAt(0))
      await flushPromises()

      expect(fetchSkiRoute).not.toHaveBeenCalled()
      expect(wrapper.find('[role="status"]').text()).toBe('map.trail.offline')
    })

    it('should stay silent on an offline tap beside the routes', async () => {
      isOnline.value = false
      const wrapper = mountMapPage(skiOn)

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', tapAt(300))
      await flushPromises()

      expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('should only close a tour sheet, without a lookup', async () => {
      const wrapper = mountMapPage(skiOn)
      wrapper.vm.activeOverlay = 'feedback'
      await flushPromises()

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('mapBackgroundClick', tapAt(0))
      await flushPromises()

      expect(fetchSkiRoute).not.toHaveBeenCalled()
      expect(wrapper.vm.activeOverlay).toBeNull()
    })

    it('should close an open trail card when the next tap misses', async () => {
      const wrapper = mountMapPage(skiOn, { TrailCard: { template: '<div data-testid="trail-card" />' } })
      const map = wrapper.findComponent({ name: 'TourenbuddyMap' })

      await map.vm.$emit('mapBackgroundClick', tapAt(0))
      await flushPromises()
      expect(wrapper.vm.activeOverlay).toBe('trail-info')

      await map.vm.$emit('mapBackgroundClick', tapAt(300))
      await flushPromises()
      expect(wrapper.vm.activeOverlay).toBeNull()
    })

    describe('framing the trail card highlight', () => {
      const other = { ...trail, id: 'r2', lines: [[[8.5, 46.9], [8.51, 46.91]]] }
      const list = { candidates: [trail, other], more: 0, selectedId: null }

      // Every vertex projects into the map area beside the card, so the whole highlight counts as visible.
      function mountVisible() {
        vi.spyOn(fakeMap, 'project').mockReturnValue({ x: 200, y: 300 })
        vi.spyOn(fakeMap, 'getContainer').mockReturnValue({ clientWidth: 1200, clientHeight: 800, getBoundingClientRect: () => ({ width: 1200, height: 800 }) })
        fakeMap.flyTo.mockClear()
        fakeMap.easeTo.mockClear()
        mountMapPage(skiOn, { TrailCard: { template: '<div />' } })
        return useMapStore()
      }

      async function show(mapStore: ReturnType<typeof useMapStore>, card: object) {
        mapStore.trailCard = card as never
        await flushPromises()
      }

      it('should fly to a route chosen from the list even when it is already fully visible', async () => {
        const mapStore = mountVisible()
        const camera = vi.spyOn(fakeMap, 'cameraForBounds')
        await show(mapStore, list)

        await show(mapStore, { ...list, selectedId: 'r2' })

        const [bounds, options] = camera.mock.calls[0] as unknown as [{ toArray: () => number[][] }, { maxZoom: number }]
        expect(bounds.toArray()).toEqual(other.lines[0])
        expect(options.maxZoom).toBe(ROUTE_ZOOM)
        expect(cameraMoves()).toBe(1)
      })

      it('should not move the camera when a lookup opens a single visible route', async () => {
        await show(mountVisible(), { candidates: [trail], more: 0, selectedId: 'r1' })

        expect(cameraMoves()).toBe(0)
      })

      it('should not move the camera when going back to a visible list', async () => {
        const mapStore = mountVisible()
        await show(mapStore, { ...list, selectedId: 'r2' })
        fakeMap.flyTo.mockClear()
        fakeMap.easeTo.mockClear()

        await show(mapStore, list)

        expect(cameraMoves()).toBe(0)
      })
    })
  })

  describe('tour marker click', () => {
    it('should call selectTour with the clicked tour id', async () => {
      const wrapper = mountMapPage()
      const mapStore = useMapStore()

      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('tourClicked', 'tour-b')
      await wrapper.vm.$nextTick()

      expect(mapStore.selectTour).toHaveBeenCalledWith('tour-b')
    })

    it('should close the feedback sheet when a tour marker is clicked', async () => {
      const wrapper = mountMapPage()
      const toursStore = useToursStore()
      const mapStore = useMapStore()

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(true)

      toursStore.$patch({ tours: [STUB_TOUR] })
      await wrapper.findComponent({ name: 'TourenbuddyMap' }).vm.$emit('tourClicked', STUB_TOUR.id)
      // Simulate store update (stubbed action doesn't mutate state)
      mapStore.$patch({ selectedTourId: STUB_TOUR.id })
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="tour-info-sheet"]').exists()).toBe(true)
    })
  })

  describe('dedicated close button', () => {
    it('should call selectTour(null) when the tour info sheet emits close', async () => {
      const wrapper = mountMapPage()
      const mapStore = useMapStore()
      const toursStore = useToursStore()

      toursStore.$patch({ tours: [STUB_TOUR] })
      mapStore.$patch({ selectedTourId: STUB_TOUR.id })
      wrapper.vm.activeOverlay = 'tour'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="tour-info-sheet"]').exists()).toBe(true)

      await wrapper.findComponent({ name: 'TourInfoSheet' }).vm.$emit('close')
      await wrapper.vm.$nextTick()

      expect(mapStore.selectTour).toHaveBeenCalledWith(null)
    })

    it('should close the feedback sheet when it emits close', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()

      await wrapper.findComponent({ name: 'FeedbackSheet' }).vm.$emit('close')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(false)
    })

    it('should close the user profile sheet when it emits close', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'profile'
      await wrapper.vm.$nextTick()

      await wrapper.findComponent({ name: 'UserProfileSheet' }).vm.$emit('close')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="profile-sheet"]').exists()).toBe(false)
    })
  })

  describe('single active overlay enforcement', () => {
    it('should close contacts sheet when feedback sheet is opened', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'contacts'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="contacts-sheet"]').exists()).toBe(true)

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="contacts-sheet"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(true)
    })

    it('should close feedback sheet when contacts sheet is opened', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(true)

      wrapper.vm.activeOverlay = 'contacts'
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="contacts-sheet"]').exists()).toBe(true)
    })

    it('should clear tour selection when feedback sheet is opened while a tour is selected', async () => {
      const wrapper = mountMapPage()
      const mapStore = useMapStore()
      const toursStore = useToursStore()

      toursStore.$patch({ tours: [STUB_TOUR] })
      mapStore.$patch({ selectedTourId: STUB_TOUR.id })
      wrapper.vm.activeOverlay = 'tour'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="tour-info-sheet"]').exists()).toBe(true)

      // openOverlay('feedback') triggers closeOverlay() path for 'tour'
      wrapper.vm.openOverlay('feedback')
      await wrapper.vm.$nextTick()

      expect(mapStore.selectTour).toHaveBeenCalledWith(null)
      expect(wrapper.find('[data-testid="tour-info-sheet"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(true)
    })

    it('should not show more than one sheet at a time', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()

      const visibleSheets = [
        wrapper.find('[data-testid="feedback-sheet"]').exists(),
        wrapper.find('[data-testid="profile-sheet"]').exists(),
        wrapper.find('[data-testid="contacts-sheet"]').exists(),
        wrapper.find('[data-testid="tour-info-sheet"]').exists(),
      ].filter(Boolean)

      expect(visibleSheets).toHaveLength(1)
    })
  })

  describe('calendar feature notice', () => {
    it('shows the one-time notice and dismisses only the notice gate', async () => {
      const wrapper = mountMapPage({
        userProfile: {
          profile: {
            id: 'user-123',
            firstName: 'Max',
            lastName: 'Muster',
            locale: 'en',
            onboardingTourShowAtSignIn: false,
            onboardingTourLastStep: 0,
            calendarTourShowOnFirstOpen: true,
            calendarFeatureNoticeShowAtSignIn: true,
          },
        },
      })
      const userProfileStore = useUserProfileStore()

      expect(wrapper.vm.showCalendarFeatureNotice).toBe(true)

      wrapper.vm.dismissCalendarFeatureNotice()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.showCalendarFeatureNotice).toBe(false)
      expect(userProfileStore.dismissCalendarFeatureNotice).toHaveBeenCalledTimes(1)
      expect(userProfileStore.dismissCalendarTour).not.toHaveBeenCalled()
    })
  })

  describe('guided tour quit early', () => {
    it('should return to the overlay the tour was started from, without the menu', async () => {
      const wrapper = mountMapPage()
      wrapper.vm.activeOverlay = 'profile'
      await wrapper.vm.$nextTick()

      wrapper.vm.onboardingTour.startTour(0)
      wrapper.vm.onboardingTour.finish()
      await new Promise(r => setTimeout(r, 50))

      expect(wrapper.vm.activeOverlay).toBe('profile')
      expect(overlayMenu.openMenu).not.toHaveBeenCalled()
    })
  })

  describe('tour-creation overlay', () => {
    const STAGE = { key: 's1', goal: { lng: 8.2, lat: 46.8 }, seed: null, picks: null, drawnTrack: null }

    it('should close feedback when tour-creation overlay is opened', async () => {
      const wrapper = mountMapPage()

      wrapper.vm.activeOverlay = 'feedback'
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(true)

      wrapper.vm.stages = [STAGE]
      wrapper.vm.openOverlay('tour-creation')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="feedback-sheet"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="tour-creation-dialog"]').exists()).toBe(true)
    })

    it('should drop the whole draft when another overlay opens', async () => {
      const wrapper = mountMapPage()
      wrapper.vm.stages = [STAGE]
      wrapper.vm.activeOverlay = 'tour-creation'
      await wrapper.vm.$nextTick()

      wrapper.vm.openOverlay('feedback')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('[data-testid="tour-creation-dialog"]').exists()).toBe(false)
      expect(wrapper.vm.stages).toEqual([])
      expect(useMapStore().setPreviewStages).toHaveBeenLastCalledWith([])
    })
  })

  describe('route step (map-first-tour-creation)', () => {
    const at = (lng: number, lat: number, name: string | null = null, elevation: number | null = null, loading = false) =>
      ({ location: { lng, lat }, name, elevation, loading })
    const planner = (wrapper: VueWrapper) => wrapper.findComponent(RoutePlannerStub)

    async function startNew() {
      const wrapper = mountMapPage({}, { RoutePlanner: RoutePlannerStub })
      wrapper.vm.startNewTour()
      await nextTick()
      return wrapper
    }

    it('should start a new tour on the map with its start, not the crosshair picker', async () => {
      const wrapper = await startNew()
      expect(planner(wrapper).props('step')).toBe('start')
      expect(wrapper.findComponent({ name: 'LocationPicker' }).exists()).toBe(false)
      expect(useMapStore().setPickingLocation).toHaveBeenLastCalledWith(true)
    })

    it('should show the next day\'s start moving along with the end being set, before it is kept', async () => {
      const wrapper = mountMapPage({}, { RoutePlanner: RoutePlannerStub })
      const hut = { lng: 8.35, lat: 46.77 }
      wrapper.vm.stages = [{ key: 'a', goal: { lng: 8.4, lat: 46.78 }, seed: null, picks: null, drawnTrack: null }, { key: 'b', goal: { lng: 8.3, lat: 46.77 }, seed: null, picks: null, drawnTrack: null }]
      wrapper.vm.stageLive = { b: { start: hut } }
      wrapper.vm.planner = { initial: { start: null, goal: at(8.4, 46.78), end: at(hut.lng, hut.lat) }, step: 'end', stage: 0, seed: null, track: null, fixedLine: null, first: 0 }
      await nextTick()
      planner(wrapper).vm.$emit('change', { start: null, goal: at(8.4, 46.78), end: at(8.36, 46.76) })
      await nextTick()
      const shown = vi.mocked(useMapStore().setPreviewStages).mock.lastCall![0]
      expect(shown[1]!.startPoint).toEqual({ lng: 8.36, lat: 46.76 })
    })

    it('should leave no draft behind when the route step is cancelled before any form', async () => {
      const wrapper = await startNew()
      planner(wrapper).vm.$emit('change', { start: at(8.1, 46.7), goal: null, end: null })
      await nextTick()

      planner(wrapper).vm.$emit('cancel')
      await nextTick()

      expect(planner(wrapper).exists()).toBe(false)
      expect(wrapper.vm.activeOverlay).toBeNull()
      expect(useMapStore().setPreviewStages).toHaveBeenLastCalledWith([])
    })

    it('should hand the form the names and heights it found, and leave a point still loading to the form', async () => {
      const wrapper = await startNew()
      planner(wrapper).vm.$emit('done', { points: { start: at(8.1, 46.7, 'Engelberg', 1002), goal: at(8.3, 46.8, null, null, true), end: null }, track: null })
      await nextTick()

      expect(wrapper.vm.activeOverlay).toBe('tour-creation')
      expect(wrapper.vm.stages[0]).toMatchObject({
        goal: { lng: 8.3, lat: 46.8 },
        picks: [
          { type: 'start', location: { lng: 8.1, lat: 46.7 }, name: 'Engelberg', elevation: 1002 },
          { type: 'goal', location: { lng: 8.3, lat: 46.8 } },
        ],
      })
      expect(wrapper.vm.stages[0]!.picks![1]).not.toHaveProperty('elevation')
    })

    it('should hand back only what moved when the form reopens the route step, and a removed end', async () => {
      const route = { goal: { name: 'Titlis', elevation: 3238 }, start: { location: { lng: 8.1, lat: 46.7 }, name: 'Engelberg', elevation: 1002 }, end: { location: { lng: 8.5, lat: 46.9 }, name: 'Meiringen', elevation: 595 } }
      const wrapper = mountMapPage({}, {
        RoutePlanner: RoutePlannerStub,
        TourCreationDialog: { ...TourCreationDialogStub, expose: ['routeOf'], setup: () => ({ routeOf: () => route }) },
      })
      wrapper.vm.stages = [{ key: 's1', goal: { lng: 8.4, lat: 46.8 }, seed: null, picks: null, drawnTrack: null }]
      wrapper.vm.activeOverlay = 'tour-creation'
      await nextTick()

      wrapper.findComponent({ name: 'TourCreationDialog' }).vm.$emit('pick-point', 'start')
      await nextTick()
      expect(planner(wrapper).props('initial')).toMatchObject({ goal: at(8.4, 46.8, 'Titlis', 3238), start: at(8.1, 46.7, 'Engelberg', 1002) })

      planner(wrapper).vm.$emit('done', { points: { goal: at(8.4, 46.8, 'Titlis', 3238), start: at(8.15, 46.72, 'Grafenort', 570), end: null }, track: null })
      await nextTick()

      expect(wrapper.vm.stages[0]!.picks).toEqual([
        { type: 'start', location: { lng: 8.15, lat: 46.72 }, name: 'Grafenort', elevation: 570 },
        { type: 'end', location: null },
      ])
    })

    it('should not make a stage of the next day when its route step is cancelled', async () => {
      const draft = { name: 'Day 1', plannedDate: new Date('2027-03-12'), endDate: null, endPoint: { lng: 8.5, lat: 46.9 }, endPointName: 'Hut', endPointElevation: 2300 }
      const wrapper = mountMapPage({}, {
        RoutePlanner: RoutePlannerStub,
        TourCreationDialog: { ...TourCreationDialogStub, expose: ['snapshotOf', 'routeOf'], setup: () => ({ snapshotOf: () => draft, routeOf: () => null }) },
      })
      wrapper.vm.stages = [{ key: 's1', goal: { lng: 8.4, lat: 46.8 }, seed: null, picks: null, drawnTrack: null }]
      wrapper.vm.activeOverlay = 'tour-creation'
      await nextTick()

      wrapper.findComponent({ name: 'TourCreationDialog' }).vm.$emit('next-day')
      await nextTick()
      // The next day starts at the hut, the day after, its goal next.
      expect(planner(wrapper).props()).toMatchObject({ step: 'goal', initial: { start: at(8.5, 46.9, 'Hut', 2300) } })

      planner(wrapper).vm.$emit('cancel')
      await nextTick()
      expect(wrapper.vm.stages).toHaveLength(1)
      expect(wrapper.vm.activeOverlay).toBe('tour-creation')
    })

    it('should number a split span\'s days and keep counting past it', async () => {
      const draft = { name: 'Trek', plannedDate: new Date('2027-03-12'), endDate: null, endPoint: null }
      const wrapper = mountMapPage({}, {
        RoutePlanner: RoutePlannerStub,
        TourCreationDialog: { ...TourCreationDialogStub, expose: ['snapshotOf', 'routeOf'], setup: () => ({ snapshotOf: () => draft, routeOf: () => null }) },
      })
      wrapper.vm.stages = [{ key: 's1', goal: { lng: 8.4, lat: 46.8 }, seed: null, picks: null, drawnTrack: null }]
      wrapper.vm.activeOverlay = 'tour-creation'
      await nextTick()

      wrapper.findComponent({ name: 'TourCreationDialog' }).vm.$emit('next-day', 3)
      await nextTick()
      expect(planner(wrapper).props('title')).toBe('tours.creation.dayOf')
      expect(wrapper.vm.dayCount).toBe(3)
      // Without an end the next day starts at the goal, dated the day after the span's first day.
      expect(planner(wrapper).props('initial').start.location).toEqual({ lng: 8.4, lat: 46.8 })
    })
  })

  describe('saving the stages', () => {
    const goal = { lng: 8.3, lat: 46.9 }
    const payload = (name: string) => ({ draft: { name, tourTypes: [] }, goal, preUploadedTourId: null, draftId: '' })

    it('should create a laid-out trip as one new outing in order and open it', async () => {
      const wrapper = mountMapPage({ auth: { currentUser: { id: 'me' } } })
      const toursStore = useToursStore()
      vi.mocked(toursStore.createTourFromDraft).mockResolvedValueOnce('t1').mockResolvedValueOnce('t2')

      await wrapper.vm.handleTourCreated([payload('Day 1'), payload('Day 2')])

      const outings = vi.mocked(toursStore.createTourFromDraft).mock.calls.map(([draft]) => draft.outing)
      expect(outings.map(o => o?.position)).toEqual([0, 1])
      expect(outings[0]!.id).toBe(outings[1]!.id)
      expect(toursStore.dropIfDuplicate).not.toHaveBeenCalled()
      expect(useMapStore().selectOuting).toHaveBeenCalledWith(`me/${outings[0]!.id}`)
    })

    it('should keep a split tour\'s first day and put the next day after it', async () => {
      const anchor = { ...STUB_TOUR, id: 'anchor', userId: 'me', outing: null, plannedDate: new Date('2027-03-12'), endDate: new Date('2027-03-14') }
      const wrapper = mountMapPage({ tours: { tours: [anchor] }, auth: { currentUser: { id: 'me' } } }, {
        RoutePlanner: RoutePlannerStub,
        TourCreationDialog: { ...TourCreationDialogStub, expose: ['snapshotOf', 'routeOf'], setup: () => ({ snapshotOf: () => null, routeOf: () => null }) },
      })
      const toursStore = useToursStore()
      const outing = { id: 'o', name: null, position: 0 }
      vi.mocked(toursStore.ensureOuting).mockResolvedValue(outing)
      vi.mocked(toursStore.nextInOuting).mockReturnValue({ ...outing, position: 1 })
      vi.mocked(toursStore.createTourFromDraft).mockResolvedValue('t2')

      wrapper.vm.handleSplitTour('anchor')
      await nextTick()
      expect(wrapper.findComponent(RoutePlannerStub).props('title')).toBe('tours.creation.dayOf')
      expect(wrapper.vm.dayCount).toBe(3)

      wrapper.findComponent(RoutePlannerStub).vm.$emit('done', { points: { start: null, goal: { location: goal, name: 'Hut', elevation: 2400, loading: false }, end: null }, track: null })
      await flushPromises()
      expect(wrapper.vm.stages[0]!.seed).toMatchObject({ plannedDate: new Date('2027-03-13'), startPoint: anchor.goal })
      // Day 3 of 3 follows at once, from the hut (named as it was set), the day after.
      expect(wrapper.findComponent(RoutePlannerStub).props()).toMatchObject({ step: 'goal', initial: { start: { location: goal, name: 'Hut', loading: false } } })
      wrapper.findComponent(RoutePlannerStub).vm.$emit('cancel')
      await nextTick()
      expect(wrapper.vm.stages).toHaveLength(1)

      await wrapper.vm.handleTourCreated([payload('Day 2')])
      expect(toursStore.keepFirstDay).toHaveBeenCalledWith('anchor')
      expect(toursStore.createTourFromDraft).toHaveBeenCalledWith(expect.objectContaining({ outing: { ...outing, position: 1 } }), goal, null)
      expect(useMapStore().selectOuting).toHaveBeenCalledWith('me/o')
    })

    it('should take the draft off the map even when a save fails', async () => {
      const wrapper = mountMapPage()
      wrapper.vm.stages = [{ key: 's1', goal, seed: null, picks: null, drawnTrack: null }]
      wrapper.vm.activeOverlay = 'tour-creation'
      await nextTick()
      const toursStore = useToursStore()
      vi.mocked(toursStore.createTourFromDraft).mockRejectedValue(new Error('create failed'))

      // The error still propagates (to Vue's global handler) — finally only guarantees cleanup.
      await expect(wrapper.vm.handleTourCreated([payload('Summit')])).rejects.toThrow('create failed')
      await nextTick()

      expect(useMapStore().setPreviewStages).toHaveBeenLastCalledWith([])
    })
  })

  describe('sheet while the picker searches', () => {
    it('should hide the collapsed overlay without unmounting it, and never once the pick or the page is gone', async () => {
      const LocationPickerStub = defineComponent({ name: 'LocationPicker', emits: ['searching'], template: '<div />' })
      const wrapper = mountMapPage({ tours: { tours: [STUB_TOUR] }, map: { selectedTourId: STUB_TOUR.id } }, { LocationPicker: LocationPickerStub })
      wrapper.vm.activeOverlay = 'tour'
      useMapStore().$patch({ isPickingLocation: true })
      await wrapper.vm.$nextTick()

      const flagged = () => document.documentElement.classList.contains('picker-searching')
      wrapper.findComponent(LocationPickerStub).vm.$emit('searching', true)
      await wrapper.vm.$nextTick()
      expect(flagged()).toBe(true)
      expect(wrapper.findComponent(TourInfoSheetStub).exists()).toBe(true)

      useMapStore().$patch({ isPickingLocation: false })
      await wrapper.vm.$nextTick()
      expect(flagged()).toBe(false)

      useMapStore().$patch({ isPickingLocation: true })
      await wrapper.vm.$nextTick()
      expect(flagged()).toBe(true)
      wrapper.unmount()
      expect(flagged()).toBe(false)
    })
  })

  describe('name from the picker search (editing a saved tour)', () => {
    const POINT = { lng: 9.908, lat: 46.382 }

    it('should hand the search result name to the edit form, and keep it out of the draft marker', async () => {
      const wrapper = mountMapPage()
      wrapper.vm.pendingPickType = 'goal'
      useMapStore().$patch({ isPickingLocation: true })
      await wrapper.vm.$nextTick()

      wrapper.vm.handleLocationConfirmed({ ...POINT, name: 'Piz Bernina' })

      expect(wrapper.vm.editPickedPoint).toEqual({ type: 'goal', location: POINT, name: 'Piz Bernina' })
      expect(useMapStore().setPreviewGoal).toHaveBeenCalledWith(POINT)
    })
  })

  describe('calendar-originated back navigation', () => {
    // Open a planned-view tour, then emit the info sheet's back event.
    async function openPlannedTourThenBack(
      plannedDate: Date | null,
      opts: { endDate?: Date | null, originDay?: string } = {},
    ) {
      const wrapper = mountMapPage()
      const toursStore = useToursStore()
      const mapStore = useMapStore()

      toursStore.$patch({
        tours: [{ ...STUB_TOUR, plannedDate, endDate: opts.endDate ?? null }],
      })
      mapStore.$patch({ selectedTourId: STUB_TOUR.id })
      wrapper.vm.tourDetailOriginDay = opts.originDay ?? null
      wrapper.vm.tourDetailOrigin = 'cal-planned'
      wrapper.vm.activeOverlay = 'tour'
      await wrapper.vm.$nextTick()

      push.mockClear()
      await wrapper.findComponent({ name: 'TourInfoSheet' }).vm.$emit('back')
      await wrapper.vm.$nextTick()
      return push
    }

    it('returns to the tour\'s CURRENT planned day, not the day it was opened from', async () => {
      // The date was edited to 2026-08-20 in the detail; back must open that day.
      const back = await openPlannedTourThenBack(new Date(2026, 7, 20))
      expect(back).toHaveBeenCalledWith({
        name: 'calendar',
        query: { view: 'planned', day: '2026-08-20' },
      })
    })

    it('omits the day param when the tour was unplanned in the detail', async () => {
      const back = await openPlannedTourThenBack(null)
      expect(back).toHaveBeenCalledWith({
        name: 'calendar',
        query: { view: 'planned' },
      })
    })

    it('returns to the day a span was opened from, not the span\'s first day', async () => {
      const back = await openPlannedTourThenBack(new Date(2026, 7, 25), {
        endDate: new Date(2026, 7, 27),
        originDay: '2026-08-27',
      })
      expect(back).toHaveBeenCalledWith({
        name: 'calendar',
        query: { view: 'planned', day: '2026-08-27' },
      })
    })

    it('falls back to the start day when an edit shortened the span past the origin day', async () => {
      // Opened from day 3, then the span was cut to a single day in the detail.
      const back = await openPlannedTourThenBack(new Date(2026, 7, 25), {
        endDate: null,
        originDay: '2026-08-27',
      })
      expect(back).toHaveBeenCalledWith({
        name: 'calendar',
        query: { view: 'planned', day: '2026-08-25' },
      })
    })
  })

  describe('speed dial blocks the action bar', () => {
    // `defineExpose` unwraps refs for the parent, so the exposed `isOpen` is a plain
    // boolean. Reading `.value` off it yielded `undefined`, so an open speed dial never
    // put the bar into dismiss mode and its buttons acted instead of closing the dial.
    it('should put the action bar in dismiss mode while the speed dial is open', async () => {
      const wrapper = mountMapPage(
        {},
        {
          MapActionOverlay: {
            name: 'MapActionOverlay',
            template: '<div />',
            expose: ['isOpen'],
            setup: () => ({ isOpen: ref(true) }),
          },
        },
      )

      // The template ref lands after the first render, so the bar picks it up next tick.
      await nextTick()

      const bar = wrapper.findComponent({ name: 'TourActionBar' })
      expect(bar.props('dismissMode')).toBe(true)
      expect(bar.props('toursDisabled')).toBe(true)
    })
  })
})

describe('mapPage — outings (#338)', () => {
  const seg = (id: string, position: number) => ({ ...STUB_TOUR, id, userId: 'me', outing: { id: 'o1', name: null, position } })
  const segments = [seg('a', 0), seg('b', 1)]
  const map = (wrapper: VueWrapper) => wrapper.findComponent({ name: 'TourenbuddyMap' })

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('should open the whole outing when a segment marker of a closed outing is tapped', async () => {
    const wrapper = mountMapPage({ tours: { tours: segments } })
    await map(wrapper).vm.$emit('tourClicked', 'b')
    expect(useMapStore().selectOuting).toHaveBeenCalledWith('me/o1')
    expect(useMapStore().selectTour).not.toHaveBeenCalledWith('b')
  })

  it('should open a segment tapped inside the open outing and go back to the overview', async () => {
    const wrapper = mountMapPage({ tours: { tours: segments }, map: { selectedOutingKey: 'me/o1' } })
    const mapStore = useMapStore()
    await map(wrapper).vm.$emit('tourClicked', 'b')
    expect(mapStore.selectTour).toHaveBeenCalledWith('b')

    mapStore.$patch({ selectedTourId: 'b', selectedOutingKey: null })
    await flushPromises()
    await wrapper.findComponent({ name: 'TourInfoSheet' }).vm.$emit('back')
    expect(mapStore.selectOuting).toHaveBeenLastCalledWith('me/o1')
  })

  it('should mint the outing on save and create the new segment into it', async () => {
    const wrapper = mountMapPage(
      { tours: { tours: [{ ...STUB_TOUR, id: 'anchor', userId: 'me', outing: null }] } },
      {
        RoutePlanner: RoutePlannerStub,
        TourInfoSheet: { ...TourInfoSheetStub, emits: ['close', 'back', 'add-segment'] },
      },
    )
    const mapStore = useMapStore()
    const toursStore = useToursStore()
    const outing = { id: 'new-outing', name: null, position: 0 }
    vi.mocked(toursStore.ensureOuting).mockResolvedValue(outing)
    vi.mocked(toursStore.nextInOuting).mockReturnValue({ ...outing, position: 1 })
    vi.mocked(toursStore.createTourFromDraft).mockResolvedValue('new')

    mapStore.$patch({ selectedTourId: 'anchor' })
    await flushPromises()
    await wrapper.findComponent({ name: 'TourInfoSheet' }).vm.$emit('add-segment', 'anchor')
    // The new segment starts where the anchor ends (its goal), its goal next.
    expect(wrapper.findComponent(RoutePlannerStub).props()).toMatchObject({ step: 'goal', initial: { start: { location: STUB_TOUR.goal, name: null, loading: true } } })

    wrapper.findComponent(RoutePlannerStub).vm.$emit('done', { points: { start: { location: STUB_TOUR.goal, name: 'Test Tour', elevation: null, loading: false }, goal: { location: { lng: 8.3, lat: 46.9 }, name: null, elevation: null, loading: false }, end: null }, track: null })
    await nextTick()
    expect(wrapper.vm.stages[0]!.seed).toMatchObject({ startPoint: STUB_TOUR.goal })
    // The start sits on the anchor's goal, whose name is the tour's title: the route step names
    // the place and the form takes that name, not the title.
    expect(wrapper.findComponent(RoutePlannerStub).exists()).toBe(false)
    expect(wrapper.vm.stages[0]!.seed).toMatchObject({ startPointName: null })
    expect(wrapper.vm.stages[0]!.picks!.map(p => p.type)).toEqual(['start', 'goal'])

    await wrapper.vm.handleTourCreated([{ draft: { name: 'Summit', tourTypes: [] }, goal: { lng: 8.3, lat: 46.9 }, preUploadedTourId: null, draftId: '' }])
    expect(toursStore.ensureOuting).toHaveBeenCalledWith('anchor')
    expect(toursStore.createTourFromDraft).toHaveBeenCalledWith(
      expect.objectContaining({ outing: { ...outing, position: 1 } }),
      { lng: 8.3, lat: 46.9 },
      null,
    )
    expect(mapStore.selectTour).toHaveBeenLastCalledWith('new')
  })
})
