import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseRealtime, mockRepo, mockCurrentUser, mockNotifyReceived, mockNotifyResponded } = vi.hoisted(() => ({
  mockUseRealtime: vi.fn(),
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
  mockNotifyReceived: vi.fn(),
  mockNotifyResponded: vi.fn(),
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: mockUseRealtime,
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

describe('friendshipsStore — realtime wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = { id: 'user-me', phone_confirmed_at: '2024-01-01T00:00:00Z' }
    mockUseRealtime.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
  })

  it('calls useRealtimeSubscription with four bindings for friend_requests and friendships', async () => {
    const { useFriendshipsStore } = await import(
      '@/features/friendships/presentation/stores/friendships-store'
    )
    useFriendshipsStore()

    expect(mockUseRealtime).toHaveBeenCalledTimes(1)
    const opts = mockUseRealtime.mock.calls[0][0]

    const bindings = opts.bindings()
    expect(bindings).toHaveLength(4)

    const tables = bindings.map((b: { table: string }) => b.table)
    expect(tables.filter((t: string) => t === 'friend_requests')).toHaveLength(2)
    expect(tables.filter((t: string) => t === 'friendships')).toHaveLength(2)

    const filters = bindings.map((b: { filter: string }) => b.filter)
    expect(filters).toContain('to_user_id=eq.user-me')
    expect(filters).toContain('from_user_id=eq.user-me')
    expect(filters).toContain('request_user_id=eq.user-me')
    expect(filters).toContain('response_user_id=eq.user-me')
  })

  it('onChange is a debounced refetch (calls repo.listIncoming after trigger)', async () => {
    vi.useFakeTimers()
    const { useFriendshipsStore } = await import(
      '@/features/friendships/presentation/stores/friendships-store'
    )
    useFriendshipsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    expect(mockRepo.listIncoming).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(mockRepo.listIncoming).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('invariant: onChange never calls notify spies', async () => {
    vi.useFakeTimers()
    const { useFriendshipsStore } = await import(
      '@/features/friendships/presentation/stores/friendships-store'
    )
    useFriendshipsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    vi.advanceTimersByTime(200)

    expect(mockNotifyReceived).not.toHaveBeenCalled()
    expect(mockNotifyResponded).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
