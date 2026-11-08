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
    get currentUser() {
      return mockCurrentUser.value
    },
    get isAuthenticated() {
      return mockCurrentUser.value != null
    },
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

/** Authenticated + phone-verified store with empty initial data; awaits initial fetch. */
async function verifiedStore() {
  mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
  const store = useFriendshipsStore()
  await vi.waitFor(() => expect(store.isLoading).toBe(false))
  return store
}

function unverifiedStore() {
  mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: null }
  return useFriendshipsStore()
}

describe('useFriendshipsStore (errors + edges only)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = null
    mockRepo.listIncoming.mockResolvedValue([])
    mockRepo.listFriendships.mockResolvedValue([])
  })

  describe('phone-verified gating', () => {
    it.each([
      [
        'sendRequest',
        async (s: ReturnType<typeof useFriendshipsStore>) => s.sendRequest('user-other'),
        null,
      ],
      [
        'findUserByPhone',
        async (s: ReturnType<typeof useFriendshipsStore>) => s.findUserByPhone('+41791234567'),
        null,
      ],
      [
        'findUsersByPhones',
        async (s: ReturnType<typeof useFriendshipsStore>) => s.findUsersByPhones(['+41791234567']),
        [],
      ],
    ])('%s short-circuits when caller phone unverified', async (_, action, expected) => {
      const result = await action(unverifiedStore())
      expect(result).toEqual(expected)
      expect(mockRepo.sendRequest).not.toHaveBeenCalled()
      expect(mockRepo.findUserByPhone).not.toHaveBeenCalled()
      expect(mockRepo.findUsersByPhones).not.toHaveBeenCalled()
    })

    it('findPhonesByUserIds skips RPC when unverified', async () => {
      await unverifiedStore().findPhonesByUserIds(['user-a'])
      expect(mockRepo.findPhonesByUserIds).not.toHaveBeenCalled()
    })

    it('findUsersByPhones early-returns on empty list (no RPC)', async () => {
      const store = await verifiedStore()
      expect(await store.findUsersByPhones([])).toEqual([])
      expect(mockRepo.findUsersByPhones).not.toHaveBeenCalled()
    })

    it('findPhonesByUserIds skips RPC when all ids already cached', async () => {
      const store = await verifiedStore()
      store.userIdToPhoneMap = new Map([['user-a', '+41791111111']])
      await store.findPhonesByUserIds(['user-a'])
      expect(mockRepo.findPhonesByUserIds).not.toHaveBeenCalled()
    })
  })

  describe('optimistic rollback', () => {
    it('sendRequest rollback on RLS rejection (no orphan in outgoing)', async () => {
      mockRepo.sendRequest.mockRejectedValue(new Error('row-level security'))
      const store = await verifiedStore()
      await expect(store.sendRequest('user-other')).rejects.toThrow('row-level security')
      expect(store.outgoingRequests).toHaveLength(0)
    })

    it('accept rollback restores incoming and removes optimistic friendship', async () => {
      mockRepo.accept.mockRejectedValue(new Error('failed'))
      const store = await verifiedStore()
      store.incomingRequests = [makeRequest()]
      await expect(store.accept('req-1')).rejects.toThrow('failed')
      expect(store.incomingRequests).toHaveLength(1)
      expect(store.friendships).toHaveLength(0)
    })

    it('accept on unknown requestId is a silent no-op (no repo call)', async () => {
      const store = await verifiedStore()
      await store.accept('does-not-exist')
      expect(mockRepo.accept).not.toHaveBeenCalled()
    })

    it('deny rollback restores incoming request', async () => {
      mockRepo.deny.mockRejectedValue(new Error('failed'))
      const store = await verifiedStore()
      store.incomingRequests = [makeRequest()]
      await expect(store.deny('req-1')).rejects.toThrow('failed')
      expect(store.incomingRequests).toHaveLength(1)
    })

    it('cancel rollback restores outgoing request', async () => {
      mockRepo.cancel.mockRejectedValue(new Error('failed'))
      const store = await verifiedStore()
      store.outgoingRequests = [
        makeRequest({ id: 'r', fromUserId: 'user-me', toUserId: 'user-other' }),
      ]
      await expect(store.cancel('r')).rejects.toThrow('failed')
      expect(store.outgoingRequests).toHaveLength(1)
    })

    it('removeFriendship rollback restores friendship row on RPC failure', async () => {
      mockRepo.removeFriendship.mockRejectedValue(new Error('rpc error'))
      const store = await verifiedStore()
      const f = makeFriendship('user-me', 'user-other')
      store.friendships = [f]
      await expect(store.removeFriendship('user-other')).rejects.toThrow('rpc error')
      expect(store.friendships).toEqual([f])
    })

    it('removeFriendship is a no-op when not authenticated', async () => {
      const store = useFriendshipsStore()
      await store.removeFriendship('user-other')
      expect(mockRepo.removeFriendship).not.toHaveBeenCalled()
    })
  })

  describe('graceful RPC failure (non-throwing lookups)', () => {
    it('findUserByPhone returns null when repo throws', async () => {
      mockRepo.findUserByPhone.mockRejectedValue(new Error('RPC error'))
      expect(await (await verifiedStore()).findUserByPhone('+41791234567')).toBeNull()
    })

    it('findUsersByPhones returns [] when repo throws', async () => {
      mockRepo.findUsersByPhones.mockRejectedValue(new Error('RPC error'))
      expect(await (await verifiedStore()).findUsersByPhones(['+41791234567'])).toEqual([])
    })

    it('findPhonesByUserIds swallows error (logged, no throw)', async () => {
      mockRepo.findPhonesByUserIds.mockRejectedValue(new Error('RPC error'))
      const store = await verifiedStore()
      await expect(store.findPhonesByUserIds(['user-a'])).resolves.toBeUndefined()
    })

    it('fetchAll surfaces error message when listIncoming rejects', async () => {
      mockRepo.listIncoming.mockRejectedValue(new Error('boom'))
      const store = await verifiedStore()
      expect(store.error).toBe('boom')
    })
  })

  describe('getNamesByUserIds', () => {
    it('skips RPC when caller not phone-verified', async () => {
      await unverifiedStore().getNamesByUserIds(['user-a'])
      expect(mockRepo.getNamesByUserIds).not.toHaveBeenCalled()
    })

    it('skips RPC when all ids already cached', async () => {
      const store = await verifiedStore()
      store.userIdToNamesMap = new Map([['user-a', { firstName: 'Ada', lastName: null }]])
      await store.getNamesByUserIds(['user-a'])
      expect(mockRepo.getNamesByUserIds).not.toHaveBeenCalled()
    })

    it('merges results into userIdToNamesMap', async () => {
      mockRepo.getNamesByUserIds.mockResolvedValue([
        { userId: 'user-a', firstName: 'Ada', lastName: 'Lovelace' },
      ])
      const store = await verifiedStore()
      await store.getNamesByUserIds(['user-a'])
      expect(store.userIdToNamesMap.get('user-a')).toEqual({ firstName: 'Ada', lastName: 'Lovelace' })
    })

    it('clear() resets userIdToNamesMap', async () => {
      const store = await verifiedStore()
      store.userIdToNamesMap = new Map([['user-a', { firstName: 'Ada', lastName: null }]])
      store.clear()
      expect(store.userIdToNamesMap.size).toBe(0)
    })
  })

  describe('derived state edges', () => {
    it('friendUserIds is empty when not authenticated', () => {
      const store = useFriendshipsStore()
      expect(store.friendUserIds.size).toBe(0)
    })

    it('friendUserIds excludes self even if friendship row contains self twice (defensive)', async () => {
      const store = await verifiedStore()
      store.friendships = [makeFriendship('user-me', 'user-other')]
      expect(store.friendUserIds.has('user-me')).toBe(false)
      expect(store.friendUserIds.has('user-other')).toBe(true)
    })

    it('clear() resets all collections', async () => {
      const store = await verifiedStore()
      store.incomingRequests = [makeRequest()]
      store.friendships = [makeFriendship('user-me', 'user-other')]
      store.userIdToPhoneMap = new Map([['x', '+41']])
      store.clear()
      expect(store.incomingRequests).toHaveLength(0)
      expect(store.friendships).toHaveLength(0)
      expect(store.userIdToPhoneMap.size).toBe(0)
    })
  })
})
