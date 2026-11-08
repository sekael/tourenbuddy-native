import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store'
import { makeFriendship, makeRequest } from '../../_helpers'

const { mockRepo, mockCurrentUser } = vi.hoisted(() => ({
  mockRepo: {
    sendRequest: vi.fn(),
    accept: vi.fn(),
    deny: vi.fn(),
    cancel: vi.fn(),
    listIncoming: vi.fn(),
    listFriendships: vi.fn(),
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

async function verifiedStore() {
  mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
  const store = useFriendshipsStore()
  await vi.waitFor(() => expect(store.isLoading).toBe(false))
  return store
}

describe('useFriendshipsStore — pendingRequestUserIds', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = null
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
  })

  it('should be empty when no requests', async () => {
    const store = await verifiedStore()
    expect(store.pendingRequestUserIds.size).toBe(0)
  })

  it('should include toUserId from outgoing requests', async () => {
    mockRepo.listIncoming.mockResolvedValue([
      makeRequest({ fromUserId: 'user-me', toUserId: 'user-a' }),
    ])
    const store = await verifiedStore()
    expect(store.pendingRequestUserIds.has('user-a')).toBe(true)
  })

  it('should include fromUserId from incoming requests', async () => {
    mockRepo.listIncoming.mockResolvedValue([
      makeRequest({ fromUserId: 'user-b', toUserId: 'user-me' }),
    ])
    const store = await verifiedStore()
    expect(store.pendingRequestUserIds.has('user-b')).toBe(true)
  })

  it('should include both directions when multiple pending requests', async () => {
    mockRepo.listIncoming.mockResolvedValue([
      makeRequest({ fromUserId: 'user-me', toUserId: 'user-a' }),
      makeRequest({ id: 'req-2', fromUserId: 'user-b', toUserId: 'user-me' }),
    ])
    const store = await verifiedStore()
    expect(store.pendingRequestUserIds.has('user-a')).toBe(true)
    expect(store.pendingRequestUserIds.has('user-b')).toBe(true)
  })
})

describe('useFriendshipsStore — currentUserHasAnyRelationship', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = null
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
  })

  it('should return false for both when store is empty', async () => {
    const store = await verifiedStore()
    const result = store.currentUserHasAnyRelationship()
    expect(result).toEqual({ hasPending: false, hasFriendship: false })
  })

  it('should return hasPending true when pending requests exist', async () => {
    mockRepo.listIncoming.mockResolvedValue([makeRequest()])
    const store = await verifiedStore()
    const result = store.currentUserHasAnyRelationship()
    expect(result.hasPending).toBe(true)
    expect(result.hasFriendship).toBe(false)
  })

  it('should return hasFriendship true when friendships exist', async () => {
    mockRepo.listFriendships.mockResolvedValue([makeFriendship('user-me', 'user-friend')])
    const store = await verifiedStore()
    const result = store.currentUserHasAnyRelationship()
    expect(result.hasFriendship).toBe(true)
    expect(result.hasPending).toBe(false)
  })

  it('should return both true when both exist', async () => {
    mockRepo.listFriendships.mockResolvedValue([makeFriendship('user-me', 'user-friend')])
    mockRepo.listIncoming.mockResolvedValue([makeRequest()])
    const store = await verifiedStore()
    const result = store.currentUserHasAnyRelationship()
    expect(result.hasFriendship).toBe(true)
    expect(result.hasPending).toBe(true)
  })
})

describe('useFriendshipsStore — incomingRequestFrom', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = null
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
  })

  it('should return null when no incoming request from that user', async () => {
    mockRepo.listIncoming.mockResolvedValue([
      makeRequest({ fromUserId: 'user-me', toUserId: 'user-a' }), // outgoing, not incoming
    ])
    const store = await verifiedStore()
    expect(store.incomingRequestFrom('user-a')).toBeNull()
  })

  it('should return the pending incoming request from the matched user', async () => {
    mockRepo.listIncoming.mockResolvedValue([
      makeRequest({ id: 'req-b', fromUserId: 'user-b', toUserId: 'user-me' }),
    ])
    const store = await verifiedStore()
    expect(store.incomingRequestFrom('user-b')?.id).toBe('req-b')
  })
})

describe('useFriendshipsStore — sendRequest unique-violation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = null
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
  })

  it('should roll back the optimistic outgoing row and rethrow on a concurrent cross-send collision', async () => {
    mockRepo.sendRequest.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "friend_requests_pending_pair_idx"'),
    )
    const store = await verifiedStore()

    await expect(store.sendRequest('user-b')).rejects.toThrow()
    expect(store.outgoingRequests.some(r => r.toUserId === 'user-b')).toBe(false)
  })
})
