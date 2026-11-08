import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BaseIconButton from '@/core/components/base-icon-button.vue'
import PlannedCalendar from '@/features/calendar/presentation/components/planned-calendar.vue'
import SeasonsGantt from '@/features/calendar/presentation/components/seasons-gantt.vue'
import CalendarPage from '@/features/calendar/presentation/pages/calendar-page.vue'
import { useMapStore } from '@/features/map/presentation/stores/map-store'
import OnboardingWelcome from '@/features/onboarding/presentation/components/onboarding-welcome.vue'
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store'

const replace = vi.fn()
const push = vi.fn()
let routeQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ replace, push }),
  onBeforeRouteLeave: vi.fn(),
}))
// Stub the spotlight lib + CSS so the tour can run without a real overlay.
vi.mock('driver.js', () => ({ driver: () => ({ highlight: vi.fn(), destroy: vi.fn(), refresh: vi.fn() }) }))
vi.mock('driver.js/dist/driver.css', () => ({}))

function mountPage() {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: true,
    initialState: {
      tours: { tours: [], friendTours: [], isLoading: false, error: null },
      availability: { editing: false, savedDays: new Set(), workingDays: new Set(), saving: false, error: null },
      userProfile: { profile: { id: 'u1', calendarTourShowOnFirstOpen: false } },
    },
  })
  return mount(CalendarPage, { shallow: true, global: { plugins: [pinia] } })
}

function replayButton(wrapper: ReturnType<typeof mountPage>) {
  return wrapper.findAllComponents(BaseIconButton).find(b => b.props('name') === 'help')!
}

describe('calendarPage — demo content gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery = {}
  })

  it('passes no demo chips to the planned view when the tour is not running', () => {
    const wrapper = mountPage()
    expect(wrapper.findComponent(PlannedCalendar).props('demoChips')).toBeNull()
  })

  it('passes no demo season bar to the seasons view when the tour is not running', () => {
    routeQuery = { view: 'seasons' }
    const wrapper = mountPage()
    expect(wrapper.findComponent(SeasonsGantt).props('demoTour')).toBeNull()
  })

  it('renders demo chips on the planned view only while the tour runs', async () => {
    const wrapper = mountPage()
    replayButton(wrapper).vm.$emit('click') // startTour(0) → isRunning
    await wrapper.vm.$nextTick()

    const chips = wrapper.findComponent(PlannedCalendar).props('demoChips') as any
    expect(chips).not.toBeNull()
    expect(chips.entries).toHaveLength(1)
    expect(chips.friends).toHaveLength(1)
  })

  it('renders the demo season bar on the seasons view only while the tour runs', async () => {
    routeQuery = { view: 'seasons' }
    const wrapper = mountPage()
    replayButton(wrapper).vm.$emit('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findComponent(SeasonsGantt).props('demoTour')).not.toBeNull()
  })
})

// The calendar-tour gate rule (Decision 2) in calendar-page.vue. Asserts the
// table: hand-off + fresh gate starts directly + flips the gate; hand-off +
// spent gate does nothing; no intent + spent gate does nothing.
describe('calendarPage — calendar-tour gate rule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeQuery = {}
  })

  function mountWithGate(opts: { intent: boolean, gateFresh: boolean }) {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      stubActions: true,
      initialState: {
        tours: { tours: [], friendTours: [], isLoading: false, error: null },
        availability: { editing: false, savedDays: new Set(), workingDays: new Set(), saving: false, error: null },
        userProfile: { profile: { id: 'u1', calendarTourShowOnFirstOpen: opts.gateFresh } },
      },
    })
    // consumePendingIntent is a stubbed action; program its return so the gate
    // rule sees (or doesn't see) the hand-off intent.
    const mapStore = useMapStore(pinia)
    ;(mapStore.consumePendingIntent as any).mockReturnValue(opts.intent ? { startCalendarTour: true } : null)
    // `teleport: false` keeps the teleported welcome in the rendered tree —
    // shallow mount stubs Teleport by default, which drops its children.
    const wrapper = mount(CalendarPage, {
      shallow: true,
      global: { plugins: [pinia], stubs: { teleport: false } },
    })
    return { wrapper, mapStore }
  }

  it('hand-off + fresh gate: asks first (welcome, tour not yet running, gate untouched)', async () => {
    const { wrapper } = mountWithGate({ intent: true, gateFresh: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(OnboardingWelcome).exists()).toBe(true)
    // Demo content only exists while the driver tour actually runs.
    expect(wrapper.findComponent(PlannedCalendar).props('demoChips')).toBeNull()
    expect(useUserProfileStore().dismissCalendarTour).not.toHaveBeenCalled()
  })

  it('hand-off + spent gate: neither tour nor welcome', async () => {
    const { wrapper } = mountWithGate({ intent: true, gateFresh: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(PlannedCalendar).props('demoChips')).toBeNull()
    expect(wrapper.findComponent(OnboardingWelcome).exists()).toBe(false)
  })

  it('no intent + spent gate: does nothing', async () => {
    const { wrapper } = mountWithGate({ intent: false, gateFresh: false })
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(PlannedCalendar).props('demoChips')).toBeNull()
  })

  it('consumes the hand-off intent on every mount', () => {
    const { mapStore } = mountWithGate({ intent: true, gateFresh: false })
    expect(mapStore.consumePendingIntent).toHaveBeenCalledTimes(1)
  })
})
