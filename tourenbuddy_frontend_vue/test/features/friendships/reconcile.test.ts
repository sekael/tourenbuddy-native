import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRequest } from './_helpers'

const { mockRepo, mockCurrentUser } = vi.hoisted(() => ({
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
  mockCurrentUser: {
    value: null as { id: string, phone_confirmed_at: string | null } | null,
  },
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() }),
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

describe('friendshipsStore — reconcile', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
  })

  it('(a) Realtime-first: sendRequest optimistic + refetch with server row → exactly one row, no duplicate', async () => {
    const { useFriendshipsStore } = await import(
      '@/features/friendships/presentation/stores/friendships-store'
    )

    // Initial load completes
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
    const store = useFriendshipsStore()
    await vi.waitFor(() => expect(store.isLoading).toBe(false))

    // Optimistic write in flight — RPC not yet resolved
    const serverRow = makeRequest({ id: 'server-id', fromUserId: 'user-me', toUserId: 'user-b' })
    mockRepo.sendRequest.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(serverRow), 500)),
    )

    vi.useFakeTimers()
    const sendPromise = store.sendRequest('user-b')
    expect(store.outgoingRequests).toHaveLength(1)
    expect(store.outgoingRequests[0]._optimistic).toBe(true)

    // Realtime echo triggers refetch (server row visible) before RPC resolves
    mockRepo.listIncoming.mockResolvedValue([serverRow])
    await store.fetchAll()

    // Optimistic row replaced by server row — no duplicate
    expect(store.outgoingRequests).toHaveLength(1)
    expect(store.outgoingRequests[0].id).toBe('server-id')
    expect(store.outgoingRequests[0]._optimistic).toBeUndefined()

    vi.runAllTimers()
    await sendPromise
    vi.useRealTimers()
  })

  it('(b) RPC-first: sendRequest resolves then refetch returns same row → exactly one row', async () => {
    const { useFriendshipsStore } = await import(
      '@/features/friendships/presentation/stores/friendships-store'
    )

    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
    const store = useFriendshipsStore()
    await vi.waitFor(() => expect(store.isLoading).toBe(false))

    const serverRow = makeRequest({ id: 'server-id', fromUserId: 'user-me', toUserId: 'user-b' })
    mockRepo.sendRequest.mockResolvedValue(serverRow)

    await store.sendRequest('user-b')
    expect(store.outgoingRequests).toHaveLength(1)
    expect(store.outgoingRequests[0].id).toBe('server-id')

    // Realtime echo triggers refetch — same row returned
    mockRepo.listIncoming.mockResolvedValue([serverRow])
    await store.fetchAll()

    expect(store.outgoingRequests).toHaveLength(1)
    expect(store.outgoingRequests[0].id).toBe('server-id')
  })

  it('(c) in-flight preservation: refetch with empty server keeps optimistic temp', async () => {
    const { useFriendshipsStore } = await import(
      '@/features/friendships/presentation/stores/friendships-store'
    )

    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
    const store = useFriendshipsStore()
    await vi.waitFor(() => expect(store.isLoading).toBe(false))

    // Start in-flight send — keep pending
    mockRepo.sendRequest.mockImplementation(() => new Promise(() => {}))
    store.sendRequest('user-b')
    expect(store.outgoingRequests[0]._optimistic).toBe(true)

    // Refetch returns empty (server hasn't committed yet)
    mockRepo.listIncoming.mockResolvedValue([])
    await store.fetchAll()

    // Optimistic temp preserved
    expect(store.outgoingRequests).toHaveLength(1)
    expect(store.outgoingRequests[0]._optimistic).toBe(true)
  })
})
