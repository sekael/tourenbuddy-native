import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TourSuggestionReviewSheet from '@/features/tours/presentation/components/tour-suggestion-review-sheet.vue'
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store'

vi.mock('@/features/tours/data/repositories/tour-suggestions-repository-impl', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/features/tours/data/repositories/tour-suggestions-repository-impl',
  )
  return {
    ...actual,
    SupabaseTourSuggestionsRepository: vi.fn().mockImplementation(() => ({
      listForUser: vi.fn().mockResolvedValue([]),
      acceptBatch: vi.fn(),
    })),
  }
})

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn(() => ({ status: { value: 'idle' }, stop: vi.fn() })),
}))

/** The owner's existing attachments — every cap decision is computed off this list. */
const attachmentRows = vi.hoisted(() => ({ value: [] as { id: string }[] }))

vi.mock('@/features/tours/data/repositories/tour-attachment-repository-impl', () => ({
  SupabaseTourAttachmentRepository: vi.fn().mockImplementation(() => ({
    list: vi.fn(async () => attachmentRows.value),
  })),
}))

const tour = { id: 't1', name: 'Gfroren Hora' } as never

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    tourId: 't1',
    ownerId: 'owner-1',
    suggesterId: 'friend-1',
    batchId: 'b1',
    field: 'name',
    value: 'New name',
    baseValue: 'Old name',
    currentValue: 'Old name',
    targetId: null,
    status: 'pending',
    isStale: false,
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
    suggesterFirstName: 'Jakob',
    suggesterLastName: null,
    ...overrides,
  }
}

function mountSheet(rows: ReturnType<typeof suggestion>[], mode: 'owner' | 'author' = 'owner') {
  const wrapper = mount(TourSuggestionReviewSheet, {
    props: { tour, mode },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
      stubs: {
        BaseIcon: { props: ['name'], template: '<i :data-icon="name" />' },
        BaseButton: {
          props: ['disabled'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
      },
    },
  })
  const store = useTourSuggestionsStore()
  store.suggestions = rows as never
  return { wrapper, store }
}

describe('tourSuggestionReviewSheet', () => {
  it('shows the empty state when nothing is pending', () => {
    const { wrapper } = mountSheet([])

    expect(wrapper.find('[data-testid="review-empty"]').exists()).toBe(true)
  })

  it('does not list resolved rows — those belong to the history view', async () => {
    const { wrapper } = mountSheet([
      suggestion({ id: 'a', status: 'accepted', resolvedAt: new Date('2026-08-02') }),
    ])
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="review-empty"]').exists()).toBe(true)
  })

  it('groups rows by batch so one submit reads as one review', async () => {
    const { wrapper } = mountSheet([
      suggestion({ id: 'a', batchId: 'b1' }),
      suggestion({ id: 'b', batchId: 'b1', field: 'notes' }),
      suggestion({ id: 'c', batchId: 'b2', suggesterId: 'friend-2' }),
    ])
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.batch')).toHaveLength(2)
  })

  it('leaves every row pending when accept-all fails', async () => {
    const { wrapper, store } = mountSheet([suggestion({ id: 'a' }), suggestion({ id: 'b' })])
    // One transaction server-side (D10): a breach rolls the whole call back, so the sheet
    // must not optimistically resolve anything.
    store.acceptBatch = vi.fn().mockRejectedValue(new Error('tour_attachment_limit_exceeded'))
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="accept-all-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(store.suggestions.every(s => s.status === 'pending')).toBe(true)
  })

  it('gives the author revise instead of accept-all', async () => {
    const { wrapper } = mountSheet([suggestion()], 'author')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="accept-all-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="revise-btn"]').exists()).toBe(true)
  })

  it('emits revise with the batch id so the form reopens on the same batch (D12)', async () => {
    const { wrapper } = mountSheet([suggestion({ batchId: 'b7' })], 'author')
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="revise-btn"]').trigger('click')

    expect(wrapper.emitted('revise')?.[0]).toEqual(['b7'])
  })
})

describe('tourSuggestionReviewSheet — attachment cap (D10)', () => {
  const full = () => Array.from({ length: 5 }, (_, i) => ({ id: `att-${i}` }))
  const add = (o = {}) => suggestion({ id: 'add', field: 'attachment_add', value: { originalFilename: 'x.jpg' }, ...o })
  const remove = (targetId: string) => suggestion({ id: 'rm', field: 'attachment_remove', value: null, targetId })

  async function render(rows: ReturnType<typeof suggestion>[]) {
    const { wrapper } = mountSheet(rows)
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('refuses accept-all when the batch would end over the cap', async () => {
    // The reported bug: the owner declined the paired removal, leaving an add alone on a
    // full tour. The row disabled itself, accept-all did not, and the server raised.
    attachmentRows.value = full()
    const wrapper = await render([add()])

    expect(wrapper.find('[data-testid="accept-all-btn"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="accept-all-hint"]').exists()).toBe(true)
  })

  it('allows accept-all for a swap — the cap is evaluated on the END state', async () => {
    attachmentRows.value = full()
    const wrapper = await render([add(), remove('att-0')])

    expect(wrapper.find('[data-testid="accept-all-btn"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="accept-all-hint"]').exists()).toBe(false)
  })

  it('does not count a removal whose target is already gone as freeing a slot', async () => {
    attachmentRows.value = full()
    const wrapper = await render([add(), remove('att-deleted-elsewhere')])

    expect(wrapper.find('[data-testid="accept-all-btn"]').attributes('disabled')).toBeDefined()
  })

  it('keeps accept-all available on a tour with room to spare', async () => {
    attachmentRows.value = [{ id: 'att-0' }]
    const wrapper = await render([add()])

    expect(wrapper.find('[data-testid="accept-all-btn"]').attributes('disabled')).toBeUndefined()
  })
})
