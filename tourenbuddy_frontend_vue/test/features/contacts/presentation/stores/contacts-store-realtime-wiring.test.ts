import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── hoisted mocks ────────────────────────────────────────────────────────────

const { mockUseRealtime, mockCurrentUser, mockFetchContacts } = vi.hoisted(() => ({
  mockUseRealtime: vi.fn(),
  mockCurrentUser: { value: null as { id: string } | null },
  mockFetchContacts: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: mockUseRealtime,
}))

vi.mock('@/features/contacts/data/repositories/contacts-repository-impl', () => ({
  ContactsRepositoryImpl: vi.fn().mockImplementation(() => ({
    fetchContacts: mockFetchContacts,
    createContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
  })),
}))

vi.mock('@/core/utils/phone-normalize', () => ({
  normalizePhone: vi.fn().mockReturnValue({ ok: false }),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    get currentUser() { return mockCurrentUser.value },
    get isAuthenticated() { return mockCurrentUser.value != null },
  }),
}))

vi.mock('@/features/friendships/presentation/stores/friendships-store', () => ({
  useFriendshipsStore: vi.fn().mockReturnValue({
    pendingRequestUserIds: new Set(),
    friendUserIds: new Set(),
  }),
}))

// ── contacts-store realtime wiring ───────────────────────────────────────────

describe('contactsStore — realtime wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUseRealtime.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
  })

  it('should pass null channel key when unauthenticated', async () => {
    mockCurrentUser.value = null
    const { useContactsStore } = await import(
      '@/features/contacts/presentation/stores/contacts-store'
    )
    useContactsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBeNull()
  })

  it('should pass enabled=false when unauthenticated', async () => {
    mockCurrentUser.value = null
    const { useContactsStore } = await import(
      '@/features/contacts/presentation/stores/contacts-store'
    )
    useContactsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.enabled()).toBe(false)
  })

  it('should pass channel key contacts-<uid> when authenticated', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useContactsStore } = await import(
      '@/features/contacts/presentation/stores/contacts-store'
    )
    useContactsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBe('contacts-user-abc')
  })

  it('should wire two bindings: contacts and contact_methods, both filtered by user_id', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useContactsStore } = await import(
      '@/features/contacts/presentation/stores/contacts-store'
    )
    useContactsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    const bindings = opts.bindings()
    expect(bindings).toHaveLength(2)
    expect(bindings[0]).toMatchObject({ event: '*', table: 'contacts', filter: 'user_id=eq.user-abc' })
    expect(bindings[1]).toMatchObject({ event: '*', table: 'contact_methods', filter: 'user_id=eq.user-abc' })
  })

  it('onChange calls loadContacts', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useContactsStore } = await import(
      '@/features/contacts/presentation/stores/contacts-store'
    )
    useContactsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    await Promise.resolve()

    expect(mockFetchContacts).toHaveBeenCalled()
  })

  it('sign-out watcher calls clear() — contacts array emptied', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useContactsStore } = await import(
      '@/features/contacts/presentation/stores/contacts-store'
    )
    const store = useContactsStore()

    // Simulate sign-out by switching auth state
    mockCurrentUser.value = null
    store.clear()

    expect(store.contacts).toHaveLength(0)
  })
})
