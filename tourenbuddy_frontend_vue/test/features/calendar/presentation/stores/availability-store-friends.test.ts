import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import { useAvailabilityStore } from '@/features/calendar/presentation/stores/availability-store'

// Realtime primitives are no-ops here — we drive loadFriends / the sign-out watch
// directly, not through a live channel.
vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: () => ({ status: ref('idle'), stop: () => {} }),
}))
vi.mock('@/core/realtime/use-realtime-broadcast', () => ({
  useRealtimeBroadcast: () => ({ status: ref('idle'), stop: () => {} }),
}))

// Controllable auth + a minimal friendships stub the store setup touches.
const auth = reactive({ isAuthenticated: true, currentUser: { id: 'me' } as { id: string } | null })
vi.mock('@/features/auth/presentation/stores/auth-store', () => ({ useAuthStore: () => auth }))
vi.mock('@/features/friendships/presentation/stores/friendships-store', () => ({
  useFriendshipsStore: () => ({ friendUserIds: new Set<string>(), getNamesByUserIds: vi.fn(), $onAction: vi.fn() }),
}))

const { listOwnFrom, applyDiff, listFriendsFrom } = vi.hoisted(() => ({
  listOwnFrom: vi.fn(),
  applyDiff: vi.fn(),
  listFriendsFrom: vi.fn(),
}))
vi.mock('@/features/calendar/data/repositories/availability-repository-impl', () => ({
  SupabaseAvailabilityRepository: vi.fn(() => ({ listOwnFrom, applyDiff, listFriendsFrom })),
}))

describe('useAvailabilityStore — friend availability', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    auth.isAuthenticated = true
    auth.currentUser = { id: 'me' }
    listOwnFrom.mockResolvedValue([])
    listFriendsFrom.mockResolvedValue([])
  })

  it('drops a stale loadFriends result so a slow refetch cannot blank the list', async () => {
    const store = useAvailabilityStore()
    await flushPromises() // let the creation-time load settle
    listFriendsFrom.mockReset()

    let resolveStale: (v: unknown) => void = () => {}
    const stalePending = new Promise((r) => {
      resolveStale = r
    })
    listFriendsFrom.mockReturnValueOnce(stalePending)
    listFriendsFrom.mockResolvedValueOnce([{ user_id: 'f2', date: '2026-08-02' }])

    const stale = store.loadFriends() // req N, still pending
    const fresh = store.loadFriends() // req N+1, resolves first
    await fresh
    resolveStale([{ user_id: 'f1', date: '2026-08-01' }]) // late arrival
    await stale

    expect(store.friendDays).toEqual([{ user_id: 'f2', date: '2026-08-02' }])
  })

  it('clears friend availability on sign-out', async () => {
    const store = useAvailabilityStore()
    await flushPromises()
    store.friendDays = [{ user_id: 'f1', date: '2026-08-01' }]

    auth.isAuthenticated = false
    await nextTick()

    expect(store.friendDays).toEqual([])
  })

  it('ignores loadFriends when there is no signed-in user', async () => {
    auth.currentUser = null
    const store = useAvailabilityStore()
    listFriendsFrom.mockClear()

    await store.loadFriends()

    expect(listFriendsFrom).not.toHaveBeenCalled()
  })
})
