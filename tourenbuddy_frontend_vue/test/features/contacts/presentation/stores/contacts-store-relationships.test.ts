import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store'

const {
  mockFetchContacts,
  mockFindUsersByPhones,
  mockFindUserByPhone,
  mockListIncoming,
  mockListFriendships,
} = vi.hoisted(() => ({
  mockFetchContacts: vi.fn(),
  mockFindUsersByPhones: vi.fn(),
  mockFindUserByPhone: vi.fn(),
  mockListIncoming: vi.fn(),
  mockListFriendships: vi.fn(),
}))

vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({
    fetchContacts: mockFetchContacts,
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
  })),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    isAuthenticated: true,
    currentUser: { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' },
  }),
}))

vi.mock('@/features/friendships/data/repositories/friendship-repository-impl', () => ({
  FriendshipRepositoryImpl: vi.fn().mockImplementation(() => ({
    sendRequest: vi.fn(),
    accept: vi.fn(),
    deny: vi.fn(),
    cancel: vi.fn(),
    listIncoming: mockListIncoming,
    listFriendships: mockListFriendships,
    findUserByPhone: mockFindUserByPhone,
    findUsersByPhones: mockFindUsersByPhones,
    findPhonesByUserIds: vi.fn(),
    getNamesByUserIds: vi.fn(),
    removeFriendship: vi.fn(),
  })),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
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

const contactWithPhone = {
  id: 'c-1',
  userId: 'user-me',
  firstName: 'Test',
  lastName: null,
  displayName: null,
  contactMethods: [
    {
      id: 'm-1',
      contactId: 'c-1',
      methodType: 'phone' as const,
      value: '+41791111111',
      label: null,
      isPrimary: true,
      isValid: true,
    },
  ],
}

const contactWithoutPhone = {
  id: 'c-2',
  userId: 'user-me',
  firstName: 'NoPhone',
  lastName: null,
  displayName: null,
  contactMethods: [],
}

describe('useContactsStore — relationshipsForContact', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockListIncoming.mockResolvedValue([])
    mockListFriendships.mockResolvedValue([])
  })

  it('should return no relationships when contact has no phones', async () => {
    mockFetchContacts.mockResolvedValue([contactWithoutPhone])
    const store = useContactsStore()
    await store.loadContacts()

    const result = await store.relationshipsForContact('c-2')
    expect(result).toEqual({ hasPending: false, hasFriendship: false })
    expect(mockFindUsersByPhones).not.toHaveBeenCalled()
  })

  it('should return no relationships when contact id not found', async () => {
    mockFetchContacts.mockResolvedValue([])
    const store = useContactsStore()
    await store.loadContacts()

    const result = await store.relationshipsForContact('nonexistent')
    expect(result).toEqual({ hasPending: false, hasFriendship: false })
  })

  it('should return no relationships when phone resolves to unregistered user', async () => {
    mockFetchContacts.mockResolvedValue([contactWithPhone])
    mockFindUsersByPhones.mockResolvedValue([])
    const store = useContactsStore()
    await store.loadContacts()

    const result = await store.relationshipsForContact('c-1')
    expect(result).toEqual({ hasPending: false, hasFriendship: false })
  })

  it('should return hasFriendship when phone resolves to a friend', async () => {
    mockFetchContacts.mockResolvedValue([contactWithPhone])
    mockFindUsersByPhones.mockResolvedValue([{ phone: '+41791111111', userId: 'user-friend' }])
    mockListFriendships.mockResolvedValue([{ requestUserId: 'user-me', responseUserId: 'user-friend', createdAt: '' }])
    const store = useContactsStore()
    await store.loadContacts()
    // wait for friendships store auto-fetch
    await vi.waitFor(() => true)

    const result = await store.relationshipsForContact('c-1')
    expect(result.hasFriendship).toBe(true)
    expect(result.hasPending).toBe(false)
  })

  it('should return hasPending when phone resolves to a user with pending request', async () => {
    mockFetchContacts.mockResolvedValue([contactWithPhone])
    mockFindUsersByPhones.mockResolvedValue([{ phone: '+41791111111', userId: 'user-pending' }])
    mockListIncoming.mockResolvedValue([
      { id: 'r-1', fromUserId: 'user-me', toUserId: 'user-pending', status: 'pending', createdAt: '', respondedAt: null },
    ])
    const store = useContactsStore()
    await store.loadContacts()
    await vi.waitFor(() => true)

    const result = await store.relationshipsForContact('c-1')
    expect(result.hasPending).toBe(true)
    expect(result.hasFriendship).toBe(false)
  })

  it('should return both when phone resolves to user with pending and friendship', async () => {
    mockFetchContacts.mockResolvedValue([contactWithPhone])
    mockFindUsersByPhones.mockResolvedValue([{ phone: '+41791111111', userId: 'user-x' }])
    mockListFriendships.mockResolvedValue([{ requestUserId: 'user-me', responseUserId: 'user-x', createdAt: '' }])
    mockListIncoming.mockResolvedValue([
      { id: 'r-1', fromUserId: 'user-me', toUserId: 'user-x', status: 'pending', createdAt: '', respondedAt: null },
    ])
    const store = useContactsStore()
    await store.loadContacts()
    await vi.waitFor(() => true)

    const result = await store.relationshipsForContact('c-1')
    expect(result.hasFriendship).toBe(true)
    expect(result.hasPending).toBe(true)
  })
})

describe('useContactsStore — relationshipsForPhone', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockListIncoming.mockResolvedValue([])
    mockListFriendships.mockResolvedValue([])
    mockFetchContacts.mockResolvedValue([])
  })

  it('should return no relationships for unregistered phone', async () => {
    mockFindUserByPhone.mockResolvedValue(null)
    const store = useContactsStore()
    await store.loadContacts()

    const result = await store.relationshipsForPhone('+41799999999')
    expect(result).toEqual({ hasPending: false, hasFriendship: false, userId: null })
  })

  it('should return hasFriendship for phone linked to a friend', async () => {
    mockFindUserByPhone.mockResolvedValue('user-friend')
    mockListFriendships.mockResolvedValue([{ requestUserId: 'user-me', responseUserId: 'user-friend', createdAt: '' }])
    const store = useContactsStore()
    await store.loadContacts()
    await vi.waitFor(() => true)

    const result = await store.relationshipsForPhone('+41791111111')
    expect(result.hasFriendship).toBe(true)
    expect(result.hasPending).toBe(false)
    expect(result.userId).toBe('user-friend')
  })

  it('should return hasPending for phone linked to pending request', async () => {
    mockFindUserByPhone.mockResolvedValue('user-pending')
    mockListIncoming.mockResolvedValue([
      { id: 'r-1', fromUserId: 'user-pending', toUserId: 'user-me', status: 'pending', createdAt: '', respondedAt: null },
    ])
    const store = useContactsStore()
    await store.loadContacts()
    await vi.waitFor(() => true)

    const result = await store.relationshipsForPhone('+41792222222')
    expect(result.hasPending).toBe(true)
    expect(result.hasFriendship).toBe(false)
    expect(result.userId).toBe('user-pending')
  })

  it('should return both when registered user has friendship and pending', async () => {
    mockFindUserByPhone.mockResolvedValue('user-x')
    mockListFriendships.mockResolvedValue([{ requestUserId: 'user-x', responseUserId: 'user-me', createdAt: '' }])
    mockListIncoming.mockResolvedValue([
      { id: 'r-1', fromUserId: 'user-me', toUserId: 'user-x', status: 'pending', createdAt: '', respondedAt: null },
    ])
    const store = useContactsStore()
    await store.loadContacts()
    await vi.waitFor(() => true)

    const result = await store.relationshipsForPhone('+41793333333')
    expect(result.hasFriendship).toBe(true)
    expect(result.hasPending).toBe(true)
  })
})

describe('useContactsStore — findContactByMethodValue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockListIncoming.mockResolvedValue([])
    mockListFriendships.mockResolvedValue([])
  })

  it('returns the other contact holding a matching normalised phone value', async () => {
    mockFetchContacts.mockResolvedValue([contactWithPhone, contactWithoutPhone])
    const store = useContactsStore()
    await store.loadContacts()

    const match = store.findContactByMethodValue('phone', '079 111 11 11')
    expect(match?.id).toBe('c-1')
  })

  it('ignores the excepted contact id (editing in place is not a duplicate of itself)', async () => {
    mockFetchContacts.mockResolvedValue([contactWithPhone, contactWithoutPhone])
    const store = useContactsStore()
    await store.loadContacts()

    const match = store.findContactByMethodValue('phone', '+41791111111', 'c-1')
    expect(match).toBeUndefined()
  })

  it('returns undefined when no contact holds the value', async () => {
    mockFetchContacts.mockResolvedValue([contactWithPhone, contactWithoutPhone])
    const store = useContactsStore()
    await store.loadContacts()

    const match = store.findContactByMethodValue('phone', '+41799999999')
    expect(match).toBeUndefined()
  })
})
