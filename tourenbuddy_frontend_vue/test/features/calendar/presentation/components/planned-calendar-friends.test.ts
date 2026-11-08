import type { VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlannedCalendar from '@/features/calendar/presentation/components/planned-calendar.vue'

// Friends are named by the VIEWER's contact for them — a friendship always resolves to a
// contact — so each seeded friend gets a contact plus a userId→phone entry, which is the
// pair the resolver walks. A friend seeded with NO contact is the broken-link state and
// falls back to the generic label. Desktop grid throughout.

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

const VIEW_DATE = new Date(2024, 5, 1) // June 2024, "today" pinned to the 10th

interface FriendRow { user_id: string, date: string }

function tour(id: string, name: string, plannedDate: Date) {
  return { id, name, plannedDate, tourTypes: ['hiking'] } as any
}

function phoneFor(userId: string) {
  return `+4179000${userId.replace(/\D/g, '').padStart(4, '0')}`
}

function contactFor(userId: string, first: string | null, last: string | null) {
  return {
    id: `c-${userId}`,
    firstName: first ?? '',
    lastName: last ?? null,
    displayName: null,
    contactMethods: [
      { id: `m-${userId}`, methodType: 'phone', value: phoneFor(userId), isPrimary: true },
    ],
  } as any
}

function mountCalendar(
  friendDays: FriendRow[],
  names: Array<[string, string | null, (string | null)?]>,
  tours: any[] = [],
) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    // The resolver runs through the real `findContactByMethodValue` (it normalizes both
    // sides of the phone comparison); stubbing every store function would stub that too.
    stubActions: false,
    initialState: {
      tours: { tours, friendTours: [], isLoading: false, error: null },
      contacts: { contacts: names.map(([id, first, last]) => contactFor(id, first, last ?? null)) },
      friendships: {
        userIdToPhoneMap: new Map(names.map(([id]) => [id, phoneFor(id)])),
      },
      availability: {
        editing: false,
        savedDays: new Set<string>(),
        workingDays: new Set<string>(),
        friendDays,
        loading: false,
        saving: false,
        error: null,
      },
    },
  })
  return mount(PlannedCalendar, { props: { viewDate: VIEW_DATE }, global: { plugins: [pinia] } })
}

// The in-month cell that carries a preview (pill or friend chip).
function contentCell(wrapper: VueWrapper) {
  return wrapper.findAll('.day-cell').find(c => c.find('.pill').exists() || c.find('.friend-chip').exists())!
}

describe('plannedCalendar — friends\' availability', () => {
  beforeEach(() => {
    mockMatchMedia(true)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 10))
  })
  afterEach(() => vi.useRealTimers())

  it('collapses multiple available friends into a single count chip', () => {
    const wrapper = mountCalendar(
      [
        { user_id: 'u1', date: '2024-06-15' },
        { user_id: 'u2', date: '2024-06-15' },
        { user_id: 'u3', date: '2024-06-15' },
      ],
      [['u1', 'Charlie'], ['u2', 'Alice'], ['u3', 'Bob']],
    )
    // >1 friend → one generic count chip, no individual friend chip.
    expect(wrapper.find('.friend-chip').exists()).toBe(false)
    expect(wrapper.findAll('.count-chip')).toHaveLength(1)
  })

  it('shows a single available friend as a chip (not a count)', () => {
    const wrapper = mountCalendar(
      [{ user_id: 'u1', date: '2024-06-15' }],
      [['u1', 'Alice']],
    )
    expect(wrapper.find('.friend-chip').text()).toBe('Alice')
    expect(wrapper.find('.count-chip').exists()).toBe(false)
  })

  it('opens a day-detail list on cell tap, tours first then all friends', async () => {
    const day = new Date(2024, 5, 15)
    const wrapper = mountCalendar(
      [
        { user_id: 'u1', date: '2024-06-15' },
        { user_id: 'u2', date: '2024-06-15' },
        { user_id: 'u3', date: '2024-06-15' },
      ],
      [['u1', 'Charlie'], ['u2', 'Alice'], ['u3', 'Bob']],
      [tour('t1', 'Ridge Loop', day)],
    )
    await contentCell(wrapper).trigger('click')

    expect(wrapper.findAll('.detail-heading')).toHaveLength(2) // tours + friends sections
    const rows = wrapper.findAll('.detail-row')
    expect(rows).toHaveLength(4) // 1 tour + 3 friends, none capped
    expect(rows[0]!.text()).toContain('Ridge Loop') // tour first
    expect(rows.slice(1).map(r => r.text())).toEqual(['Alice', 'Bob', 'Charlie']) // friends sorted
  })

  it('renders a friend with no resolvable contact as the generic label (static row, no crash)', async () => {
    // Availability for a user the viewer has no contact for — the broken friendship↔contact
    // link (#273). The row must still render, name-only, with no call/message actions.
    const wrapper = mountCalendar([{ user_id: 'u9', date: '2024-06-15' }], [])
    await contentCell(wrapper).trigger('click')

    const row = wrapper.find('.detail-row')
    expect(row.text()).toBe('tours.list.aFriend')
    expect(row.classes()).toContain('detail-row--static')
  })

  it('shows a friend chip on a day the viewer is not available (no green overlay)', () => {
    const wrapper = mountCalendar(
      [{ user_id: 'u1', date: '2024-06-20' }],
      [['u1', 'Alice']],
    )
    expect(wrapper.findAll('.friend-chip')).toHaveLength(1)
    expect(wrapper.findAll('.day-cell--available')).toHaveLength(0)
  })

  it('does not show friend availability for a past day', () => {
    const wrapper = mountCalendar(
      [{ user_id: 'u1', date: '2024-06-05' }], // before the 10th
      [['u1', 'Alice']],
    )
    expect(wrapper.findAll('.friend-chip')).toHaveLength(0)
  })

  it('resolves a friend with no first name without crashing the sort', () => {
    // Two friends so the day-list sort runs; one has no first name (only a last
    // name) — a null name previously threw in localeCompare.
    const wrapper = mountCalendar(
      [
        { user_id: 'u1', date: '2024-06-15' },
        { user_id: 'u2', date: '2024-06-15' },
      ],
      [['u1', null, 'Zimmer'], ['u2', 'Alice']],
    )
    expect(wrapper.find('.count-chip').exists()).toBe(true) // 2 friends → count chip
  })

  it('does not open a detail list for an empty day', async () => {
    const wrapper = mountCalendar([], [])
    const emptyCell = wrapper.findAll('.day-cell').find(c => !c.classes().includes('day-cell--muted'))!
    await emptyCell.trigger('click')
    expect(wrapper.find('.detail-body').exists()).toBe(false)
  })

  it('emits select with the tour id and the day it was opened from', async () => {
    const day = new Date(2024, 5, 15)
    const wrapper = mountCalendar([], [], [tour('t1', 'Ridge Loop', day)])
    await contentCell(wrapper).trigger('click') // open the day-detail list
    await wrapper.find('.detail-row').trigger('click') // tap the tour row

    // The originating day rides along so back-nav can return to it — for a span that
    // is not the tour's first day. The map side validates it against the live span.
    expect(wrapper.emitted('select')?.[0]).toEqual(['t1', '2024-06-15'])
  })

  it('re-opens a day\'s detail list via the exposed openDetailForDay', async () => {
    const wrapper = mountCalendar([{ user_id: 'u1', date: '2024-06-15' }], [['u1', 'Alice']])
    expect(wrapper.find('.detail-body').exists()).toBe(false)
    ;(wrapper.vm as any).openDetailForDay(new Date(2024, 5, 15))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.detail-body').exists()).toBe(true)
  })
})
