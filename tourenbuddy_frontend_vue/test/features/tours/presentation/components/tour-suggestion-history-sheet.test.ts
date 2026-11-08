import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TourSuggestionHistorySheet from '@/features/tours/presentation/components/tour-suggestion-history-sheet.vue'
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store'

vi.mock('@/features/tours/data/repositories/tour-suggestions-repository-impl', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/features/tours/data/repositories/tour-suggestions-repository-impl',
  )
  return {
    ...actual,
    SupabaseTourSuggestionsRepository: vi.fn().mockImplementation(() => ({
      listForUser: vi.fn().mockResolvedValue([]),
    })),
  }
})

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn(() => ({ status: { value: 'idle' }, stop: vi.fn() })),
}))

const tour = { id: 't1', name: 'Piz Ela' } as never

function resolved(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    tourId: 't1',
    ownerId: 'owner-1',
    suggesterId: 'me',
    batchId: 'b1',
    field: 'notes',
    value: 'Careful on the ridge',
    baseValue: null,
    currentValue: null,
    targetId: null,
    status: 'withdrawn',
    isStale: false,
    createdAt: new Date('2026-08-01'),
    resolvedAt: new Date('2026-08-02'),
    suggesterFirstName: null,
    suggesterLastName: null,
    ...overrides,
  }
}

async function mountSheet(rows: ReturnType<typeof resolved>[]) {
  const wrapper = mount(TourSuggestionHistorySheet, {
    props: { tour, mode: 'author' },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: { auth: { currentUser: { id: 'me' }, isAuthenticated: true } },
        }),
      ],
      stubs: { BaseIcon: { props: ['name'], template: '<i :data-icon="name" />' } },
    },
  })
  useTourSuggestionsStore().suggestions = rows as never
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('tourSuggestionHistorySheet', () => {
  it('names the reader as the author of their own batch', async () => {
    // The view resolves suggester names for the OWNER only, so a partner reading their own
    // history hits the generic fallback — "suggested by a tour partner", about themselves.
    const wrapper = await mountSheet([resolved()])

    expect(wrapper.text()).toContain('tours.suggestions.byYou')
    expect(wrapper.text()).not.toContain('tours.suggestions.aPartner')
  })

  it('falls back to the generic author when the name did not resolve', async () => {
    const wrapper = await mountSheet([resolved({ suggesterId: 'someone-else' })])

    expect(wrapper.text()).not.toContain('tours.suggestions.byYou')
    expect(wrapper.text()).toContain('tours.suggestions.byAuthor')
  })

  it('drops the divider under the last row so it does not double the card border', async () => {
    const wrapper = await mountSheet([resolved(), resolved({ id: 's2', field: 'equipment' })])

    const rows = wrapper.findAll('.row')
    expect(rows).toHaveLength(2)
    // Asserted through the class contract the scoped `:last-child` rule hangs off — happy-dom
    // does not resolve scoped stylesheets, so the rule itself is not observable here.
    expect(rows[1]!.element.nextElementSibling).toBeNull()
  })
})
