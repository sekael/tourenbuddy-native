import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnline } from '@/core/offline/use-online-status'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'
import { makeFriendship } from '../../_helpers'

// Guiding test for the fetchAll cache-routing GAP (see the TODO in friendships-store.ts).
// It is skipped so CI stays green until the gap is filled; remove `.skip` once fetchAll
// hydrates from cache offline via cachedLoad, and it should pass.

const { mockRepo, mockCurrentUser, getCachedMock, putCachedMock } = vi.hoisted(() => ({
  mockRepo: {
    sendRequest: vi.fn(),
    accept: vi.fn(),
    deny: vi.fn(),
    cancel: vi.fn(),
    listIncoming: vi.fn().mockResolvedValue([]),
    listFriendships: vi.fn().mockResolvedValue([]),
    findUserByPhone: vi.fn(),
    findUsersByPhones: vi.fn(),
    findPhonesByUserIds: vi.fn(),
    getNamesByUserIds: vi.fn(),
    removeFriendship: vi.fn(),
  },
  mockCurrentUser: { value: null as { id: string, phone_confirmed_at: string | null } | null },
  getCachedMock: vi.fn(),
  putCachedMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/core/offline/entity-cache', () => ({
  getCached: getCachedMock,
  putCached: putCachedMock,
  clearCached: vi.fn(),
}))

vi.mock('@/features/friendships/data/repositories/friendship-repository-impl', () => ({
  FriendshipRepositoryImpl: vi.fn().mockImplementation(() => mockRepo),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    get currentUser() { return mockCurrentUser.value },
    get isAuthenticated() { return mockCurrentUser.value != null },
  }),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@/core/offline/reconnect', () => ({
  flushThenRefetch: (refetch: () => Promise<void>) => refetch(),
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockImplementation((opts: { onSubscribed?: () => void }) => {
    opts.onSubscribed?.()
    return { status: { value: 'SUBSCRIBED' }, stop: vi.fn() }
  }),
}))

describe('useFriendshipsStore offline hydrate (gap)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = null
  })
  afterEach(() => {
    isOnline.value = true
  })

  it('hydrates friendships from cache offline without calling the repository', async () => {
    isOnline.value = false
    // Cache holds the composite snapshot as a one-element array (matches the unfriend seam).
    getCachedMock.mockResolvedValue([{
      incoming: [],
      outgoing: [],
      friendships: [makeFriendship('user-them', 'user-me')],
    }])

    mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
    const store = useFriendshipsStore()
    await vi.waitFor(() => expect(store.isLoading).toBe(false))

    expect(store.friendships).toHaveLength(1)
    expect(mockRepo.listFriendships).not.toHaveBeenCalled()
  })
})
