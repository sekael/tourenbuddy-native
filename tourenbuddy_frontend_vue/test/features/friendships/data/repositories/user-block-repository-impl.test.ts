import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockAlreadyExistsError, BlockCooldownError, NotBlockedError } from '@/core/exceptions'
import { UserBlockRepositoryImpl } from '@/features/friendships/data/repositories/user-block-repository-impl'

const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

function rpcError(message: string, details?: string) {
  return { data: null, error: { message, details: details ?? null } }
}

describe('userBlockRepositoryImpl — error mapping', () => {
  let repo: UserBlockRepositoryImpl

  beforeEach(() => {
    vi.clearAllMocks()
    repo = new UserBlockRepositoryImpl()
  })

  describe('block', () => {
    it('maps already_blocked to BlockAlreadyExistsError', async () => {
      mockRpc.mockResolvedValue(rpcError('already_blocked'))
      await expect(repo.block('user-b')).rejects.toBeInstanceOf(BlockAlreadyExistsError)
    })

    it('maps generic RPC error to plain Error', async () => {
      mockRpc.mockResolvedValue(rpcError('phone_not_verified'))
      await expect(repo.block('user-b')).rejects.toThrow('phone_not_verified')
    })

    it('resolves when RPC succeeds', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null })
      await expect(repo.block('user-b')).resolves.toBeUndefined()
    })
  })

  describe('unblock', () => {
    it('maps not_blocked to NotBlockedError', async () => {
      mockRpc.mockResolvedValue(rpcError('not_blocked'))
      await expect(repo.unblock('user-b')).rejects.toBeInstanceOf(NotBlockedError)
    })

    it('maps cooldown_active to BlockCooldownError with seconds', async () => {
      mockRpc.mockResolvedValue(rpcError('cooldown_active', '7200.5'))
      const err = await repo.unblock('user-b').catch(e => e)
      expect(err).toBeInstanceOf(BlockCooldownError)
      expect((err as BlockCooldownError).remainingSeconds).toBeCloseTo(7200.5)
    })

    it('maps cooldown_active with no detail to remainingSeconds 0', async () => {
      mockRpc.mockResolvedValue(rpcError('cooldown_active'))
      const err = await repo.unblock('user-b').catch(e => e)
      expect(err).toBeInstanceOf(BlockCooldownError)
      expect((err as BlockCooldownError).remainingSeconds).toBe(0)
    })
  })

  describe('isBlockedBy', () => {
    it('returns true when RPC returns true', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null })
      await expect(repo.isBlockedBy('user-b')).resolves.toBe(true)
    })

    it('returns false when RPC returns false', async () => {
      mockRpc.mockResolvedValue({ data: false, error: null })
      await expect(repo.isBlockedBy('user-b')).resolves.toBe(false)
    })

    it('throws on RPC error', async () => {
      mockRpc.mockResolvedValue(rpcError('some error'))
      await expect(repo.isBlockedBy('user-b')).rejects.toThrow('some error')
    })
  })

  describe('listActive', () => {
    it('returns empty array when no rows', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      })
      await expect(repo.listActive()).resolves.toEqual([])
    })

    it('throws on query error', async () => {
      mockFrom.mockReturnValue({
        select: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'db error' } }),
          }),
        }),
      })
      await expect(repo.listActive()).rejects.toThrow('db error')
    })
  })
})
