import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DuplicateContactAcrossContactsError } from '@/core/exceptions'
import { ContactsRepositoryImpl } from '@/features/contacts/data/repositories/contacts-repository-impl'

const { mockRpc, mockFrom } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn() }))

vi.mock('@/core/utils/supabase', () => ({
  supabase: { rpc: mockRpc, from: mockFrom },
}))

const mockRow = {
  id: 'c-1',
  user_id: 'u-1',
  first_name: 'Anna',
  last_name: null,
  display_name: null,
  contact_methods: [],
  updated_at: '2026-08-11T00:00:00Z',
}

/** from('contacts').select(...).eq('id', id).single() → {data,error} */
function fetchOneReturns(data: unknown, error: unknown = null) {
  mockFrom.mockReturnValue({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data, error })) })) })),
  })
}

describe('contactsRepositoryImpl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('updateContactFull', () => {
    const aggregate = { id: 'c-1', userId: 'u-1', firstName: 'Annika', lastName: null, displayName: null, contactMethods: [], updatedAt: null }

    it('returns null when the RPC reports the contact is gone (no resurrect)', async () => {
      mockRpc.mockResolvedValue({ data: false, error: null })

      const repo = new ContactsRepositoryImpl()
      expect(await repo.updateContactFull(aggregate)).toBeNull()
      expect(mockFrom).not.toHaveBeenCalled() // never refetches a gone row
    })

    it('throws when the RPC errors', async () => {
      mockRpc.mockResolvedValue({ data: null, error: { code: 'XX', message: 'boom' } })

      const repo = new ContactsRepositoryImpl()
      await expect(repo.updateContactFull(aggregate)).rejects.toThrow('boom')
    })

    it('returns the refetched aggregate when the RPC updated a row', async () => {
      mockRpc.mockResolvedValue({ data: true, error: null })
      fetchOneReturns({ ...mockRow, first_name: 'Annika' })

      const repo = new ContactsRepositoryImpl()
      const result = await repo.updateContactFull(aggregate)
      expect(result?.firstName).toBe('Annika')
    })
  })

  describe('createContactFull', () => {
    it('maps a cross-contact unique violation to DuplicateContactAcrossContactsError', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'contact_methods_value_unique_per_user' },
      })

      const repo = new ContactsRepositoryImpl()
      await expect(
        repo.createContactFull({ id: 'c-2', userId: 'u-1', firstName: 'Dup', lastName: null, displayName: null, contactMethods: [], updatedAt: null }),
      ).rejects.toThrow(DuplicateContactAcrossContactsError)
    })
  })

  describe('deleteContact', () => {
    it('throws when Supabase returns an error', async () => {
      mockFrom.mockReturnValue({
        delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: { message: 'Delete failed' } })) })),
      })

      const repo = new ContactsRepositoryImpl()
      await expect(repo.deleteContact('c-1')).rejects.toThrow('Delete failed')
    })
  })
})
