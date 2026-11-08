import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'

const {
  mockFetchContacts,
  mockCreateContactFull,
  mockUpdateContactFull,
  mockDeleteContact,
  mockGetContactUpdatedAt,
} = vi.hoisted(() => ({
  mockFetchContacts: vi.fn(),
  mockCreateContactFull: vi.fn(),
  mockUpdateContactFull: vi.fn(),
  mockDeleteContact: vi.fn(),
  mockGetContactUpdatedAt: vi.fn(),
}))

vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({
    fetchContacts: mockFetchContacts,
    createContactFull: mockCreateContactFull,
    updateContactFull: mockUpdateContactFull,
    deleteContact: mockDeleteContact,
    getContactUpdatedAt: mockGetContactUpdatedAt,
  })),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    isAuthenticated: true,
    currentUser: { id: 'user-123' },
  }),
}))

const mockPhoneMethod = {
  id: 'method-1',
  contactId: '1',
  methodType: 'phone' as const,
  value: '+41791234567',
  label: null,
  isPrimary: true,
  isValid: true,
}

const mockPhoneMethod2 = {
  id: 'method-2',
  contactId: '1',
  methodType: 'phone' as const,
  value: '+41442223344',
  label: 'Home',
  isPrimary: false,
  isValid: true,
}

const mockContacts = [
  { id: '1', userId: 'user-123', firstName: 'Anna', lastName: null, displayName: null, contactMethods: [], updatedAt: null },
  { id: '2', userId: 'user-123', firstName: 'Bob', lastName: 'Smith', displayName: 'Bobby', contactMethods: [mockPhoneMethod], updatedAt: null },
]

// The online `run` path mirrors the store back to whatever the repo resolves — echo the
// written aggregate so optimistic assertions read the intended shape.
function echoArg<T>(arg: T): Promise<T> {
  return Promise.resolve(arg)
}

describe('useContactsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCreateContactFull.mockImplementation(echoArg)
    mockUpdateContactFull.mockImplementation(echoArg)
    mockDeleteContact.mockResolvedValue(undefined)
  })

  it('inserts a created contact in firstName order', async () => {
    mockFetchContacts.mockResolvedValue([mockContacts[1]!])

    const store = useContactsStore()
    await store.loadContacts()
    await store.addContact('Anna')

    expect(store.contacts.map(c => c.firstName)).toEqual(['Anna', 'Bob'])
    expect(mockCreateContactFull).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Anna', contactMethods: [] }),
    )
  })

  it('does not duplicate a contact a concurrent refetch already inserted (slow-network race)', async () => {
    const created = { ...mockContacts[0]!, id: 'dup', firstName: 'Zoe' }
    mockFetchContacts.mockResolvedValue([created])
    mockCreateContactFull.mockResolvedValue(created)

    const store = useContactsStore()
    await store.loadContacts()
    await store.addContact('Zoe')

    expect(store.contacts.filter(c => c.id === 'dup')).toHaveLength(1)
  })

  it('trims name inputs before writing', async () => {
    mockFetchContacts.mockResolvedValue([])

    const store = useContactsStore()
    await store.loadContacts()
    await store.addContact('  Charlie  ', '  ', null)

    expect(mockCreateContactFull).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Charlie', lastName: null, contactMethods: [] }),
    )
  })

  it('rejects multiple phones with no primary, without writing', async () => {
    mockFetchContacts.mockResolvedValue([])

    const store = useContactsStore()
    await store.loadContacts()

    await expect(
      store.addContact('Test', null, null, [
        { value: '+41 79 123 45 67', isPrimary: false },
        { value: '+41 44 222 33 44', isPrimary: false },
      ]),
    ).rejects.toThrow()
    expect(mockCreateContactFull).not.toHaveBeenCalled()
  })

  it('forces a single phone to primary and normalizes it', async () => {
    mockFetchContacts.mockResolvedValue([])

    const store = useContactsStore()
    await store.loadContacts()
    await store.addContact('G', null, null, [{ value: '0799991122', isPrimary: false }])

    expect(mockCreateContactFull).toHaveBeenCalledWith(
      expect.objectContaining({
        contactMethods: [expect.objectContaining({ value: '+41799991122', isPrimary: true })],
      }),
    )
  })

  it('collapses duplicate phones before writing', async () => {
    mockFetchContacts.mockResolvedValue([])

    const store = useContactsStore()
    await store.loadContacts()
    await store.addContact('DedupTest', null, null, [
      { value: '+41791234567', isPrimary: true },
      { value: '+41791234567', isPrimary: false },
    ])

    const written = mockCreateContactFull.mock.calls[0]![0]
    expect(written.contactMethods).toHaveLength(1)
  })

  it('clears contacts', () => {
    const store = useContactsStore()
    store.contacts = [...mockContacts]
    store.clear()
    expect(store.contacts).toHaveLength(0)
  })

  describe('updateContact', () => {
    it('re-sorts after a rename and carries unchanged fields', async () => {
      mockFetchContacts.mockResolvedValue([...mockContacts])

      const store = useContactsStore()
      await store.loadContacts()
      await store.updateContact('1', { firstName: 'Zara' })

      expect(store.contacts.map(c => c.firstName)).toEqual(['Bob', 'Zara'])
      expect(mockUpdateContactFull).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', firstName: 'Zara' }),
      )
    })

    it('is a no-op for an unknown id', async () => {
      mockFetchContacts.mockResolvedValue([...mockContacts])
      const store = useContactsStore()
      await store.loadContacts()
      await store.updateContact('nope', { firstName: 'X' })
      expect(mockUpdateContactFull).not.toHaveBeenCalled()
    })
  })

  describe('deleteContact', () => {
    it('removes the contact optimistically', async () => {
      mockFetchContacts.mockResolvedValue([...mockContacts])

      const store = useContactsStore()
      await store.loadContacts()
      await store.deleteContact('1')

      expect(store.contacts.map(c => c.id)).toEqual(['2'])
    })

    it('propagates a repository failure', async () => {
      mockFetchContacts.mockResolvedValue([...mockContacts])
      mockDeleteContact.mockRejectedValue(new Error('FK violation'))

      const store = useContactsStore()
      await store.loadContacts()
      await expect(store.deleteContact('1')).rejects.toThrow('FK violation')
    })
  })

  describe('addMethodToContact', () => {
    it('auto-promotes the first phone to primary', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[0]!, contactMethods: [] }])

      const store = useContactsStore()
      await store.loadContacts()
      await store.addMethodToContact('1', { methodType: 'phone', value: '0791234567', isPrimary: false })

      const written = mockUpdateContactFull.mock.calls[0]![0]
      expect(written.contactMethods).toEqual([
        expect.objectContaining({ value: '+41791234567', isPrimary: true }),
      ])
    })

    it('demotes existing phones when a new primary is added', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[0]!, contactMethods: [mockPhoneMethod] }])

      const store = useContactsStore()
      await store.loadContacts()
      await store.addMethodToContact('1', { methodType: 'phone', value: '+41780000000', isPrimary: true })

      const written = mockUpdateContactFull.mock.calls[0]![0]
      const primaries = written.contactMethods.filter((m: { isPrimary: boolean }) => m.isPrimary)
      expect(primaries).toHaveLength(1)
      expect(primaries[0].value).toBe('+41780000000')
    })
  })

  describe('setPrimaryPhoneOnContact', () => {
    it('moves primary to the target phone', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[0]!, contactMethods: [mockPhoneMethod, mockPhoneMethod2] }])

      const store = useContactsStore()
      await store.loadContacts()
      await store.setPrimaryPhoneOnContact('1', 'method-2')

      const written = mockUpdateContactFull.mock.calls[0]![0]
      expect(written.contactMethods.find((m: { id: string }) => m.id === 'method-2').isPrimary).toBe(true)
      expect(written.contactMethods.find((m: { id: string }) => m.id === 'method-1').isPrimary).toBe(false)
    })

    it('throws for a method that is not a phone / not found, without writing', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[0]!, contactMethods: [mockPhoneMethod] }])

      const store = useContactsStore()
      await store.loadContacts()
      await expect(store.setPrimaryPhoneOnContact('1', 'ghost')).rejects.toThrow()
      expect(mockUpdateContactFull).not.toHaveBeenCalled()
    })

    it('leaves local state untouched when the write rejects', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[0]!, contactMethods: [mockPhoneMethod, mockPhoneMethod2] }])
      mockUpdateContactFull.mockRejectedValue(new Error('DB error'))

      const store = useContactsStore()
      await store.loadContacts()
      await expect(store.setPrimaryPhoneOnContact('1', 'method-2')).rejects.toThrow()

      const phones = store.contacts[0]!.contactMethods
      expect(phones.find(m => m.id === 'method-1')?.isPrimary).toBe(true)
      expect(phones.find(m => m.id === 'method-2')?.isPrimary).toBe(false)
    })
  })

  describe('removeMethodFromContact', () => {
    it('promotes the next phone when the primary is removed', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[0]!, contactMethods: [mockPhoneMethod, mockPhoneMethod2] }])

      const store = useContactsStore()
      await store.loadContacts()
      await store.removeMethodFromContact('1', 'method-1')

      const written = mockUpdateContactFull.mock.calls[0]![0]
      expect(written.contactMethods).toHaveLength(1)
      expect(written.contactMethods[0].id).toBe('method-2')
      expect(written.contactMethods[0].isPrimary).toBe(true)
    })

    it('does not re-promote when a non-primary phone is removed', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[0]!, contactMethods: [mockPhoneMethod, mockPhoneMethod2] }])

      const store = useContactsStore()
      await store.loadContacts()
      await store.removeMethodFromContact('1', 'method-2')

      const written = mockUpdateContactFull.mock.calls[0]![0]
      expect(written.contactMethods.map((m: { id: string }) => m.id)).toEqual(['method-1'])
      expect(written.contactMethods[0].isPrimary).toBe(true)
    })
  })

  describe('updateMethodOnContact', () => {
    it('normalizes an edited phone value', async () => {
      mockFetchContacts.mockResolvedValue([{ ...mockContacts[1]!, contactMethods: [mockPhoneMethod] }])

      const store = useContactsStore()
      await store.loadContacts()
      await store.updateMethodOnContact('2', 'method-1', { value: '0791234567' })

      const written = mockUpdateContactFull.mock.calls[0]![0]
      expect(written.contactMethods.find((m: { id: string }) => m.id === 'method-1').value).toBe('+41791234567')
    })
  })

  describe('findContactByMethodValue', () => {
    it('matches a non-normalized stored phone against an E.164 query', async () => {
      mockFetchContacts.mockResolvedValue([
        { ...mockContacts[1]!, contactMethods: [{ ...mockPhoneMethod, value: '+41 79 123 45 67' }] },
      ])

      const store = useContactsStore()
      await store.loadContacts()

      expect(store.findContactByMethodValue('phone', '+41791234567')?.id).toBe('2')
    })
  })
})
