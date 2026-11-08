import type { InboxNotification } from '@/features/notifications/domain/entities/inbox-notification'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'

const repo = vi.hoisted(() => ({
  listPage: vi.fn(),
  listUnread: vi.fn(),
  getById: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  remove: vi.fn(),
  removeAll: vi.fn(),
  recordReleaseNote: vi.fn(),
}))
const state = vi.hoisted(() => ({
  friendships: { isLoading: false, incomingRequests: [] as Array<{ id: string, status: string }> },
  tours: { isLoading: false, tours: [] as Array<{ id: string }>, friendTours: [] as Array<{ id: string, isPartner?: boolean }> },
  suggestions: { loading: false, suggestions: [] as Array<{ batchId: string, status: string }> },
  links: { loading: false, pendingRequests: [] as Array<{ id: string, status: string }> },
}))

vi.mock('@/features/notifications/data/repositories/inbox-repository-impl', () => ({
  InboxRepositoryImpl: vi.fn().mockImplementation(() => repo),
}))
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: () => ({ currentUser: { id: 'u1' }, isAuthenticated: true }),
}))
vi.mock('@/features/friendships/presentation/stores/friendships-store', () => ({ useFriendshipsStore: () => state.friendships }))
vi.mock('@/features/tours/presentation/stores/tours-store', () => ({ useToursStore: () => state.tours }))
vi.mock('@/features/tours/presentation/stores/tour-suggestions-store', () => ({ useTourSuggestionsStore: () => state.suggestions }))
vi.mock('@/features/tour-links/presentation/stores/tour-links-store', () => ({ useTourLinksStore: () => state.links }))
vi.mock('@/core/realtime/use-realtime-subscription', () => ({ useRealtimeSubscription: vi.fn() }))
vi.mock('@/core/logging/use-logger', () => ({ useLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) }))

const { supabase } = await import('@/core/utils/supabase')
const { isOnline } = await import('@/core/offline/use-online-status')
const { replayQueue } = await import('@/core/offline/replay')
const { getEntry, peekAllOrdered, remove: dequeue } = await import('@/core/offline/write-queue')
const { useInboxStore } = await import('@/features/notifications/presentation/stores/inbox-store')

function entry(i: number, over: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: `n${i}`,
    type: 'tour_updates',
    action: 'updated',
    actorId: 'a1',
    actorName: 'Jakob',
    tourId: null,
    tourName: 'Piz Ela',
    ref: {},
    occurrences: 1,
    readAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(),
    ...over,
  }
}
const range = (n: number, from = 0) => Array.from({ length: n }, (_, i) => entry(from + n - i))

describe('useInboxStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    isOnline.value = true
    // The drain refuses to run without a session (replay.ts).
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: {} }, error: null } as never)
    for (const e of await peekAllOrdered())
      await dequeue(e.entityId)
    Object.assign(state.friendships, { incomingRequests: [] })
    Object.assign(state.tours, { tours: [], friendTours: [] })
    repo.listPage.mockResolvedValue([])
    repo.listUnread.mockResolvedValue([])
    for (const fn of [repo.markRead, repo.markAllRead, repo.remove, repo.removeAll])
      fn.mockResolvedValue(undefined)
    repo.recordReleaseNote.mockResolvedValue(true)
  })

  afterEach(() => {
    isOnline.value = true
  })

  it('should count every unread entry even beyond the first listed page', async () => {
    const unread = range(30)
    repo.listPage.mockResolvedValue(unread.slice(0, 20))
    repo.listUnread.mockResolvedValue(unread)
    const store = useInboxStore()

    await store.load()

    expect(store.attentionCount).toBe(30)
  })

  it('should exclude a stale unread entry from the count', async () => {
    // Friend requests loaded with a different pending one: the entry's request was answered.
    state.friendships.incomingRequests = [{ id: 'other', status: 'pending' }]
    repo.listUnread.mockResolvedValue([
      entry(1, { type: 'friend_requests', action: 'received', ref: { request_id: 'r1' } }),
      entry(2),
    ])
    const store = useInboxStore()

    await store.load()

    expect(store.staleReason(store.entries.find(e => e.id === 'n1')!)).toBe('answered')
    expect(store.attentionCount).toBe(1)
  })

  it('should not call a tour gone before any tour has loaded', async () => {
    repo.listUnread.mockResolvedValue([entry(1, { tourId: '00000000-0000-0000-0000-000000000009' })])
    const store = useInboxStore()

    await store.load()

    expect(store.attentionCount).toBe(1)
  })

  it('should not let an entry open a friend tour its recipient was removed from', () => {
    // Still friends-visible (Friends list shows it), but no longer a partner.
    Object.assign(state.tours, { tours: [{ id: 'own' }], friendTours: [{ id: 't1', isPartner: false }] })
    const store = useInboxStore()

    expect(store.canOpenTour('t1')).toBe(false)
    expect(store.staleReason(entry(1, { tourId: 't1' }))).toBe('tourGone')
  })

  it('should resolve a collision to the recipient\'s own tour, never the actor\'s', () => {
    Object.assign(state.tours, { tours: [{ id: 'own' }], friendTours: [{ id: 'theirs', isPartner: false }] })
    const store = useInboxStore()
    const collision = entry(1, { type: 'tour_interest', action: 'collision', tourId: 'theirs', ref: { other_tour_id: 'own' } })

    expect(store.targetTourId(collision)).toBe('own')
    expect(store.staleReason(collision)).toBeNull()
  })

  it('should report no more pages when the last page comes back short', async () => {
    repo.listPage.mockResolvedValueOnce(range(20, 10)).mockResolvedValueOnce(range(5))
    const store = useInboxStore()

    await store.load()
    expect(store.hasMore).toBe(true)
    await store.loadMore()

    expect(store.hasMore).toBe(false)
    expect(repo.listPage).toHaveBeenLastCalledWith(range(20, 10).at(-1)!.createdAt, 20)
  })

  it('should replay an offline mark-all with the newest SEEN entry as cutoff, not the clock', async () => {
    const seen = range(3)
    repo.listPage.mockResolvedValue(seen)
    const store = useInboxStore()
    await store.load()

    isOnline.value = false
    await store.markAllRead()
    isOnline.value = true
    await replayQueue()

    expect(repo.markAllRead).toHaveBeenCalledExactlyOnceWith(seen[0]!.createdAt)
  })

  it('should replay an offline clear as one delete up to the newest SEEN entry, not the clock', async () => {
    const seen = range(3)
    repo.listPage.mockResolvedValue(seen)
    const store = useInboxStore()
    await store.load()

    isOnline.value = false
    await store.markAllRead()
    await store.clearAll()
    expect(store.entries).toEqual([])
    isOnline.value = true
    await replayQueue()

    expect(repo.removeAll).toHaveBeenCalledExactlyOnceWith(seen[0]!.createdAt)
    expect(repo.remove).not.toHaveBeenCalled()
  })

  it('should coalesce an offline read followed by a delete into one delete', async () => {
    repo.listPage.mockResolvedValue([entry(1)])
    const store = useInboxStore()
    await store.load()

    isOnline.value = false
    await store.markRead('n1')
    await store.remove('n1')

    expect((await getEntry('n1'))?.op).toBe('delete')
    isOnline.value = true
    await replayQueue()
    expect(repo.remove).toHaveBeenCalledWith('n1')
    expect(repo.markRead).not.toHaveBeenCalled()
  })

  it('should treat a replayed delete of an already-gone entry as done', async () => {
    repo.listPage.mockResolvedValue([entry(1)])
    const store = useInboxStore()
    await store.load()
    isOnline.value = false
    await store.remove('n1')
    isOnline.value = true

    await replayQueue()

    expect(await getEntry('n1')).toBeUndefined()
  })

  describe('release note recording', () => {
    it('should not record while offline (the next online start does)', async () => {
      isOnline.value = false
      useInboxStore()
      await flushPromises()
      expect(repo.recordReleaseNote).not.toHaveBeenCalled()
    })

    it('should swallow a failed recording instead of breaking the inbox', async () => {
      repo.recordReleaseNote.mockRejectedValue(new Error('network'))
      useInboxStore()
      await flushPromises()
      expect(repo.recordReleaseNote).toHaveBeenCalledTimes(1)
    })
  })
})
