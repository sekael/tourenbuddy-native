import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlannedCalendar from '@/features/calendar/presentation/components/planned-calendar.vue'
import { useAvailabilityStore } from '@/features/calendar/presentation/stores/availability-store'

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// June 2024, "today" pinned to the 10th → in-month days 10..30 (21) are
// future-or-today (selectable in edit mode); 1..9 are past.
const VIEW_DATE = new Date(2024, 5, 1)

interface AvailState { editing?: boolean, savedDays?: Set<string>, workingDays?: Set<string> }

function mountCalendar(availability: AvailState) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: true,
    initialState: {
      tours: { tours: [], friendTours: [], isLoading: false, error: null },
      availability: {
        editing: false,
        savedDays: new Set<string>(),
        workingDays: new Set<string>(),
        loading: false,
        saving: false,
        error: null,
        ...availability,
      },
    },
  })
  const wrapper = mount(PlannedCalendar, { props: { viewDate: VIEW_DATE }, global: { plugins: [pinia] } })
  return { wrapper, store: useAvailabilityStore(pinia) }
}

describe('plannedCalendar — availability (desktop grid)', () => {
  beforeEach(() => {
    mockMatchMedia(true)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 10))
  })
  afterEach(() => vi.useRealTimers())

  it('marks only in-month, today-or-future days selectable in edit mode', () => {
    const { wrapper } = mountCalendar({ editing: true })
    // June 10..30 inclusive = 21 days.
    expect(wrapper.findAll('.day-cell--selectable')).toHaveLength(21)
  })

  it('exposes no selectable days when not editing', () => {
    const { wrapper } = mountCalendar({ editing: false })
    expect(wrapper.findAll('.day-cell--selectable')).toHaveLength(0)
  })

  it('toggles a future day on pointerdown while editing', async () => {
    const { wrapper, store } = mountCalendar({ editing: true })
    await wrapper.find('.day-cell--selectable').trigger('pointerdown')
    expect(store.toggleDay).toHaveBeenCalledTimes(1)
  })

  it('ignores pointerdown on a past in-month day', async () => {
    const { wrapper, store } = mountCalendar({ editing: true })
    // In-month (not muted), not selectable → a past June day.
    const pastDay = wrapper.find('.day-cell:not(.day-cell--muted):not(.day-cell--selectable)')
    await pastDay.trigger('pointerdown')
    expect(store.toggleDay).not.toHaveBeenCalled()
  })

  it('ignores pointerdown entirely when not editing', async () => {
    const { wrapper, store } = mountCalendar({ editing: false, savedDays: new Set(['2024-06-15']) })
    await wrapper.find('.day-cell:not(.day-cell--muted)').trigger('pointerdown')
    expect(store.toggleDay).not.toHaveBeenCalled()
  })

  it('renders the availability overlay from the saved set in view mode', () => {
    const { wrapper } = mountCalendar({ editing: false, savedDays: new Set(['2024-06-15']) })
    expect(wrapper.findAll('.day-cell--available')).toHaveLength(1)
  })
})
