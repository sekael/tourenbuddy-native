import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnline } from '@/core/offline/use-online-status'
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store'

// ── Mocks ──────────────────────────────────────────────────────────────────────
const mockList = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockUpsert = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockAccept = vi.hoisted(() => vi.fn())
const mockAcceptBatch = vi.hoisted(() => vi.fn())
const mockDecline = vi.hoisted(() => vi.fn())
const mockWithdraw = vi.hoisted(() => vi.fn())
const mockSweep = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/features/tours/data/repositories/tour-suggestions-repository-impl', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/features/tours/data/repositories/tour-suggestions-repository-impl',
  )
  return {
    ...actual,
    SupabaseTourSuggestionsRepository: vi.fn().mockImplementation(() => ({
      listForUser: mockList,
      upsertBatch: mockUpsert,
      accept: mockAccept,
      acceptBatch: mockAcceptBatch,
      decline: mockDecline,
      withdraw: mockWithdraw,
      uploadStaged: vi.fn(),
      sweepStaged: mockSweep,
    })),
  }
})

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    currentUser: { id: 'owner-1' },
    isAuthenticated: true,
  }),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

let subscribed: (() => void) | undefined

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn((opts: { onSubscribed?: () => void }) => {
    subscribed = opts.onSubscribed
    return { status: { value: 'SUBSCRIBED' }, stop: vi.fn() }
  }),
}))

// The write queue must stay untouched: suggestions are online-only (design D6).
const enqueueSpy = vi.hoisted(() => vi.fn())
vi.mock('@/core/offline/write-queue', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/core/offline/write-queue')
  return { ...actual, assertQueueHeadroom: enqueueSpy }
})

function row(overrides: Record<string, unknown> = {}) {
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

describe('useTourSuggestionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    isOnline.value = true
    mockList.mockResolvedValue([])
  })

  it('should block a submit offline and queue nothing', async () => {
    isOnline.value = false
    const store = useTourSuggestionsStore()

    await store.submitBatch('t1', 'b1', [{ field: 'name', value: 'x' }])

    expect(mockUpsert).not.toHaveBeenCalled()
    expect(enqueueSpy).not.toHaveBeenCalled()
  })

  it('should surface a named RPC error to `error` instead of throwing at the caller', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('tour_suggestion.not_partner'))
    const store = useTourSuggestionsStore()

    await expect(
      store.submitBatch('t1', 'b1', [{ field: 'name', value: 'x' }]),
    ).rejects.toThrow('tour_suggestion.not_partner')
    expect(store.error).toBe('tour_suggestion.not_partner')
  })

  it('should surface an accept on an already-resolved row', async () => {
    mockAccept.mockRejectedValueOnce(new Error('tour_suggestion.already_resolved'))
    const store = useTourSuggestionsStore()

    await expect(store.accept(row() as never)).rejects.toThrow('already_resolved')
    expect(store.error).toBe('tour_suggestion.already_resolved')
  })

  it('should refetch on every (re-)subscribe — a hidden tab drops events', async () => {
    const store = useTourSuggestionsStore()
    mockList.mockClear()

    subscribed?.()
    await Promise.resolve()

    expect(mockList).toHaveBeenCalled()
    expect(store.error).toBeNull()
  })

  it('should count pending suggestions only on the viewer’s own tours', async () => {
    mockList.mockResolvedValue([
      row({ id: 'a', tourId: 't1' }),
      row({ id: 'b', tourId: 't1' }),
      // Authored BY the viewer on someone else's tour — never their review workload.
      row({ id: 'c', tourId: 't9', ownerId: 'other', suggesterId: 'owner-1' }),
      row({ id: 'd', tourId: 't1', status: 'declined' }),
    ])
    const store = useTourSuggestionsStore()

    await store.load()

    expect(store.pendingCountByTour).toEqual({ t1: 2 })
  })

  it('should sweep only the caller’s own staged blobs, and only once', async () => {
    mockList.mockResolvedValue([
      row({
        id: 'a',
        status: 'declined',
        suggesterId: 'owner-1',
        field: 'attachment_add',
        value: { storagePath: 'owner-1/suggestions/t1/x.jpg' },
      }),
      // Someone else's prefix: only they hold delete rights (D9).
      row({
        id: 'b',
        status: 'declined',
        suggesterId: 'friend-1',
        field: 'attachment_add',
        value: { storagePath: 'friend-1/suggestions/t1/y.jpg' },
      }),
    ])
    const store = useTourSuggestionsStore()

    await store.load()
    await store.load()

    expect(mockSweep).toHaveBeenCalledTimes(1)
    expect(mockSweep).toHaveBeenCalledWith([
      { bucket: 'tour-attachments', path: 'owner-1/suggestions/t1/x.jpg' },
    ])
  })
})
