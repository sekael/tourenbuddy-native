import type { DayEntry } from '@/features/calendar/domain/calendar-dates'
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DayPreview from '@/features/calendar/presentation/components/day-preview.vue'
import PlannedCalendar from '@/features/calendar/presentation/components/planned-calendar.vue'
import { TOUR_TYPE_COLORS } from '@/features/tours/data/models/tour-type'

// The component renders a grid on desktop and a day-tile list on mobile, gated by
// `useIsDesktop()` (matchMedia). Pin the viewport so each suite is deterministic.
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

// Only the fields the component reads; cast to satisfy the Tour type.
function tour(id: string, name: string, plannedDate: Date | null, extra: object = {}) {
  return { id, name, plannedDate, tourTypes: ['hiking'], ...extra } as any
}

function mountCalendar(tours: any[], friendTours: any[], viewDate = new Date(2024, 5, 1), extraProps: object = {}) {
  return mount(PlannedCalendar, {
    props: { viewDate, ...extraProps },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: { tours: { tours, friendTours, isLoading: false, error: null } },
        }),
      ],
    },
  })
}

describe('plannedCalendar — desktop grid', () => {
  beforeEach(() => mockMatchMedia(true))

  it('hides own tours without a planned date', () => {
    const wrapper = mountCalendar(
      [tour('t1', 'Has Date', new Date(2024, 5, 15)), tour('t2', 'No Date', null)],
      [],
    )
    const pills = wrapper.findAll('.pill')
    expect(pills).toHaveLength(1)
    expect(wrapper.text()).toContain('Has Date')
    expect(wrapper.text()).not.toContain('No Date')
  })

  it('shows partner friend tours but hides non-partner friend tours', () => {
    const wrapper = mountCalendar(
      [],
      [
        tour('f1', 'Partner Trip', new Date(2024, 5, 20), { isFriendTour: true, isPartner: true }),
        tour('f2', 'Stranger Trip', new Date(2024, 5, 21), { isFriendTour: true, isPartner: false }),
      ],
    )
    expect(wrapper.text()).toContain('Partner Trip')
    expect(wrapper.text()).not.toContain('Stranger Trip')
    // Pills are colored by tour type (matching mobile), not by friend/own — the
    // partner pill's background is its hiking color, with no friend variant.
    expect(wrapper.find('.pill--friend').exists()).toBe(false)
    expect(wrapper.find('.pill').attributes('style')).toContain(TOUR_TYPE_COLORS.hiking)
  })

  it('collapses multiple tours into a single count chip (no individual pill)', () => {
    const day = new Date(2024, 5, 10)
    const wrapper = mountCalendar(
      [tour('a', 'One', day), tour('b', 'Two', day), tour('c', 'Three', day)],
      [],
    )
    // >1 tour → one generic count chip, no individual pill; the cell opens the list.
    expect(wrapper.find('.pill').exists()).toBe(false)
    expect(wrapper.findAll('.count-chip')).toHaveLength(1)
  })

  it('highlights exactly one cell — today — when viewing the current month', () => {
    const wrapper = mountCalendar([], [], new Date())
    expect(wrapper.findAll('.day-cell--today')).toHaveLength(1)
  })

  it('highlights no cell when the current month is not in view', () => {
    // A month far from today: the 6-week window never reaches the current date.
    const wrapper = mountCalendar([], [], new Date(2000, 0, 1))
    expect(wrapper.findAll('.day-cell--today')).toHaveLength(0)
  })

  it('renders demo tour and friend in the opened today detail during the tour', async () => {
    const demoChips = {
      entries: [
        { tour: tour('demo-tour', 'Demo Tour', new Date()), isFriend: false, dayIndex: 1, dayCount: 1 },
      ],
      friends: [{ userId: 'demo-friend', name: 'Demo Friend' }],
    }
    const wrapper = mountCalendar([], [], new Date(), { demoChips })

    ;(wrapper.vm as any).openDetailForDay(new Date())
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-tour="demo-detail"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Demo Tour')
    expect(wrapper.text()).toContain('Demo Friend')
  })
})

describe('plannedCalendar — mobile day-tile list', () => {
  beforeEach(() => mockMatchMedia(false))

  it('renders one row for every day of the month, empty days included', () => {
    // June 2024 has 30 days; the list is month-bounded, so exactly 30 rows.
    const wrapper = mountCalendar([tour('t1', 'Solo', new Date(2024, 5, 15))], [])
    expect(wrapper.findAll('.day-row')).toHaveLength(30)
  })

  it('collapses multiple tours into a single count chip (no individual pill)', () => {
    const day = new Date(2024, 5, 10)
    const wrapper = mountCalendar(
      [tour('a', 'One', day), tour('b', 'Two', day), tour('c', 'Three', day)],
      [],
    )
    // Same collapse as the grid; the row opens the day-detail list for the rest.
    expect(wrapper.find('.pill').exists()).toBe(false)
    expect(wrapper.findAll('.count-chip')).toHaveLength(1)
  })

  it('still drops own tours without a planned date', () => {
    const wrapper = mountCalendar(
      [tour('t1', 'Has Date', new Date(2024, 5, 15)), tour('t2', 'No Date', null)],
      [],
    )
    expect(wrapper.findAll('.pill')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('No Date')
  })

  it('highlights exactly one row — today — when viewing the current month', () => {
    const wrapper = mountCalendar([], [], new Date())
    expect(wrapper.findAll('.day-row--today')).toHaveLength(1)
  })

  // The global `t` mock returns the key (it only substitutes into keys that carry
  // braces), so the counter's VALUES aren't observable in the rendered text — assert
  // them on the entries handed to DayPreview, and the counter's presence in the DOM.
  function spanCounters(wrapper: ReturnType<typeof mountCalendar>) {
    return wrapper
      .findAllComponents(DayPreview)
      .flatMap(c => (c.props('entries') as DayEntry[]))
      .map(e => `${e.tour.name} ${e.dayIndex}/${e.dayCount}`)
  }

  it('renders a span on every one of its days, counters reflecting the whole span', () => {
    const wrapper = mountCalendar(
      [tour('t1', 'Hut Tour', new Date(2024, 5, 10), { endDate: new Date(2024, 5, 12) })],
      [],
    )
    expect(wrapper.findAll('.pill')).toHaveLength(3)
    expect(wrapper.findAll('.day-counter')).toHaveLength(3)
    expect(spanCounters(wrapper)).toEqual([
      'Hut Tour 1/3',
      'Hut Tour 2/3',
      'Hut Tour 3/3',
    ])
  })

  it('counts a span by absolute position, not position within the visible month', () => {
    // 30 May – 2 June, viewing June: only days 3 and 4 of the span are on screen.
    const wrapper = mountCalendar(
      [tour('t1', 'Traverse', new Date(2024, 4, 30), { endDate: new Date(2024, 5, 2) })],
      [],
      new Date(2024, 5, 1),
    )
    expect(spanCounters(wrapper)).toEqual(['Traverse 3/4', 'Traverse 4/4'])
  })

  it('renders no counter on a single-day tour', () => {
    const wrapper = mountCalendar([tour('t1', 'Day Hike', new Date(2024, 5, 15))], [])
    expect(wrapper.find('.pill').text()).toBe('Day Hike')
    expect(wrapper.find('.day-counter').exists()).toBe(false)
  })

  it('still collapses to a count chip on a day a span shares with another tour', () => {
    const wrapper = mountCalendar(
      [
        tour('t1', 'Hut Tour', new Date(2024, 5, 10), { endDate: new Date(2024, 5, 12) }),
        tour('t2', 'Day Hike', new Date(2024, 5, 11)),
      ],
      [],
    )
    // Day 11 holds two tours → one count chip, no pills; days 10 and 12 keep their pill.
    expect(wrapper.findAll('.count-chip')).toHaveLength(1)
    expect(wrapper.findAll('.pill')).toHaveLength(2)
  })

  it('scrolls the list to a day when its detail is re-opened (back-navigation)', async () => {
    const day = new Date(2024, 5, 15)
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    const wrapper = mountCalendar([tour('t1', 'Solo', day)], [])

    ;(wrapper.vm as any).openDetailForDay(day)
    await wrapper.vm.$nextTick()

    expect(spy).toHaveBeenCalled()
    expect((spy.mock.contexts[0] as Element).getAttribute('data-day')).toBe('2024-06-15')
    spy.mockRestore()
  })
})
