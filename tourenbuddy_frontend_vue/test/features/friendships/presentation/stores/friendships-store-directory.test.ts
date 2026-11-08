import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'

// The userId → phone directory: its offline cache (merge direction, read failure) and the
// in-flight registry that keeps N concurrent consumers of one owner to ONE RPC.

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
    findPhonesByUserIds: vi.fn().mockResolvedValue([]),
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
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@/core/offline/reconnect', () => ({
  flushThenRefetch: (refetch: () => Promise<void>) => refetch(),
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockImplementation(() => ({
    status: { value: 'SUBSCRIBED' },
    stop: vi.fn(),
  })),
}))

async function verifiedStore() {
  mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
  const store = useFriendshipsStore()
  await vi.waitFor(() => expect(store.isLoading).toBe(false))
  return store
}

describe('friendships store — friend directory (edges only)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = null
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
    mockRepo.findPhonesByUserIds.mockResolvedValue([])
    getCachedMock.mockResolvedValue(undefined)
    putCachedMock.mockResolvedValue(undefined)
  })

  it('does not let a stale cached phone overwrite one resolved in-session', async () => {
    const store = await verifiedStore()
    mockRepo.findPhonesByUserIds.mockResolvedValue([{ userId: 'user-a', phone: '+41791111111' }])
    await store.findPhonesByUserIds(['user-a'])

    // Cache hydrate arrives afterwards carrying the number the friend has since changed.
    getCachedMock.mockResolvedValue([['user-a', '+41790000000']])
    await store.ensureDirectory()

    expect(store.userIdToPhoneMap.get('user-a')).toBe('+41791111111')
  })

  it('resolves ensureDirectory when the cache read rejects', async () => {
    getCachedMock.mockRejectedValue(new Error('IndexedDB unavailable'))
    const store = await verifiedStore()

    // Must not hang or throw — a render gate awaits this, and settled means
    // "no better answer is coming", not "an answer arrived".
    await expect(store.ensureDirectory()).resolves.toBeUndefined()
    expect(store.userIdToPhoneMap.size).toBe(0)
  })

  it('issues ONE lookup when concurrent callers ask for the same uncached id', async () => {
    const store = await verifiedStore()
    let release: (v: Array<{ userId: string, phone: string }>) => void = () => {}
    mockRepo.findPhonesByUserIds.mockReturnValue(new Promise((res) => {
      release = res
    }))

    const a = store.findPhonesByUserIds(['user-a'])
    const b = store.findPhonesByUserIds(['user-a'])
    release([{ userId: 'user-a', phone: '+41791111111' }])
    await Promise.all([a, b])

    expect(mockRepo.findPhonesByUserIds).toHaveBeenCalledTimes(1)
    expect(store.userIdToPhoneMap.get('user-a')).toBe('+41791111111')
  })

  it('re-issues the lookup after a failed one rather than caching the failure', async () => {
    const store = await verifiedStore()
    mockRepo.findPhonesByUserIds.mockRejectedValueOnce(new Error('offline'))
    await store.findPhonesByUserIds(['user-a'])

    mockRepo.findPhonesByUserIds.mockResolvedValue([{ userId: 'user-a', phone: '+41791111111' }])
    await store.findPhonesByUserIds(['user-a'])

    expect(store.userIdToPhoneMap.get('user-a')).toBe('+41791111111')
  })

  it('does not write the directory through when the lookup returned nothing', async () => {
    const store = await verifiedStore()
    await store.findPhonesByUserIds(['user-a'])

    expect(putCachedMock).not.toHaveBeenCalledWith(
      'friend-directory:user-me',
      expect.anything(),
    )
  })
})
