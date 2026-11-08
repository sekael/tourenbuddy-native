import type { UserBlock } from '@/features/friendships/data/models/user-block-schemas'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockAlreadyExistsError, BlockCooldownError, NotBlockedError } from '@/core/exceptions'
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store'

const { mockRepo, mockCurrentUser, mockFriendshipsFetchAll } = vi.hoisted(() => ({
  mockRepo: {
    listActive: vi.fn(),
    listBlockedUsers: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
    isBlockedBy: vi.fn(),
    report: vi.fn(),
  },
  mockCurrentUser: {
    value: null as { id: string, phone_confirmed_at: string | null } | null,
  },
  mockFriendshipsFetchAll: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/features/friendships/presentation/stores/friendships-store', () => ({
  useFriendshipsStore: vi.fn().mockReturnValue({
    fetchAll: mockFriendshipsFetchAll,
  }),
}))

vi.mock('@/features/friendships/data/repositories/user-block-repository-impl', () => ({
  UserBlockRepositoryImpl: vi.fn().mockImplementation(() => mockRepo),
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

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockImplementation((opts: { onSubscribed?: () => void }) => {
    opts.onSubscribed?.()
    return { status: { value: 'SUBSCRIBED' }, stop: vi.fn() }
  }),
}))

function makeBlock(overrides: Partial<UserBlock> = {}): UserBlock {
  return {
    blockerUserId: 'user-me',
    blockedUserId: 'user-b',
    firstBlockedAt: new Date(Date.now() - 1000).toISOString(),
    lastBlockedAt: new Date(Date.now() - 1000).toISOString(),
    unblockedAt: null,
    ...overrides,
  }
}

describe('userBlocksStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
    mockRepo.listActive.mockResolvedValue([])
    mockRepo.listBlockedUsers.mockResolvedValue([])
    mockRepo.isBlockedBy.mockResolvedValue(false)
  })

  describe('block', () => {
    it('calls repo and refetches on success', async () => {
      const block = makeBlock()
      mockRepo.block.mockResolvedValue(undefined)
      mockRepo.listActive.mockResolvedValue([block])
      const store = useUserBlocksStore()
      await store.block('user-b')
      expect(mockRepo.block).toHaveBeenCalledWith('user-b')
      expect(store.activeBlocks).toEqual([block])
    })

    it('silently succeeds on BlockAlreadyExistsError', async () => {
      mockRepo.block.mockRejectedValue(new BlockAlreadyExistsError())
      const store = useUserBlocksStore()
      await expect(store.block('user-b')).resolves.toBeUndefined()
    })

    it('rethrows other errors', async () => {
      mockRepo.block.mockRejectedValue(new Error('phone_not_verified'))
      const store = useUserBlocksStore()
      await expect(store.block('user-b')).rejects.toThrow('phone_not_verified')
    })
  })

  describe('unblock', () => {
    it('removes block from local list on success', async () => {
      const block = makeBlock()
      mockRepo.unblock.mockResolvedValue(undefined)
      mockRepo.listActive.mockResolvedValue([block])
      const store = useUserBlocksStore()
      await store.fetchBlocks()
      mockRepo.unblock.mockResolvedValue(undefined)
      await store.unblock('user-b')
      expect(store.blocks.find(b => b.blockedUserId === 'user-b' && b.unblockedAt === null)).toBeUndefined()
    })

    it('silently succeeds on NotBlockedError', async () => {
      mockRepo.unblock.mockRejectedValue(new NotBlockedError())
      const store = useUserBlocksStore()
      await expect(store.unblock('user-b')).resolves.toBeUndefined()
    })

    it('rethrows BlockCooldownError', async () => {
      mockRepo.unblock.mockRejectedValue(new BlockCooldownError(3600))
      const store = useUserBlocksStore()
      await expect(store.unblock('user-b')).rejects.toBeInstanceOf(BlockCooldownError)
    })
  })

  describe('isBlockedBy — cache behavior', () => {
    it('returns cached value within TTL', async () => {
      mockRepo.isBlockedBy.mockResolvedValue(true)
      const store = useUserBlocksStore()
      const first = await store.isBlockedBy('user-b')
      expect(first).toBe(true)
      expect(mockRepo.isBlockedBy).toHaveBeenCalledTimes(1)

      const second = await store.isBlockedBy('user-b')
      expect(second).toBe(true)
      expect(mockRepo.isBlockedBy).toHaveBeenCalledTimes(1)
    })

    it('re-fetches after cache is invalidated', async () => {
      mockRepo.isBlockedBy.mockResolvedValue(false)
      const store = useUserBlocksStore()
      await store.isBlockedBy('user-b')
      store.invalidateIsBlockedByCache('user-b')
      mockRepo.isBlockedBy.mockResolvedValue(true)
      const result = await store.isBlockedBy('user-b')
      expect(result).toBe(true)
      expect(mockRepo.isBlockedBy).toHaveBeenCalledTimes(2)
    })

    it('full cache wipe re-fetches all entries', async () => {
      mockRepo.isBlockedBy.mockResolvedValue(false)
      const store = useUserBlocksStore()
      await store.isBlockedBy('user-b')
      await store.isBlockedBy('user-c')
      store.invalidateIsBlockedByCache()
      expect(store.isBlockedByCache.size).toBe(0)
    })

    it('sets cache optimistically via handleSendRejectedByBlock', async () => {
      const store = useUserBlocksStore()
      store.handleSendRejectedByBlock('user-b')
      const cached = store.isBlockedByCache.get('user-b')
      expect(cached?.value).toBe(true)
    })
  })
})
