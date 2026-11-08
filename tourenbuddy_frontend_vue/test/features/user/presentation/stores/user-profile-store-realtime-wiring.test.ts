import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── hoisted mocks ────────────────────────────────────────────────────────────

const { mockUseRealtime, mockCurrentUser } = vi.hoisted(() => ({
  mockUseRealtime: vi.fn(),
  mockCurrentUser: { value: null as { id: string } | null },
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: mockUseRealtime,
}))

vi.mock('@/features/user/data/repositories/user-profile-repository-impl', () => ({
  UserProfileRepositoryImpl: vi.fn().mockImplementation(() => ({
    getUserById: vi.fn().mockResolvedValue(null),
    upsertProfile: vi.fn().mockResolvedValue({ id: 'user-abc', firstName: null, lastName: null, locale: null }),
  })),
}))

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    auth: { onAuthStateChange: vi.fn(), updateUser: vi.fn(), verifyOtp: vi.fn() },
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    realtime: { setAuth: vi.fn() },
  },
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

vi.mock('@/core/utils/phone-normalize', () => ({
  normalizePhone: vi.fn().mockReturnValue({ ok: false }),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    get currentUser() { return mockCurrentUser.value },
    get isAuthenticated() { return mockCurrentUser.value != null },
    refreshCurrentUser: vi.fn(),
  }),
}))

vi.mock('@/features/friendships/presentation/stores/friendships-store', () => ({
  useFriendshipsStore: vi.fn().mockReturnValue({ clear: vi.fn() }),
}))

// ── user-profile-store realtime wiring ──────────────────────────────────────

describe('userProfileStore — realtime wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUseRealtime.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
  })

  it('should pass null channel key when unauthenticated', async () => {
    mockCurrentUser.value = null
    const { useUserProfileStore } = await import(
      '@/features/user/presentation/stores/user-profile-store'
    )
    useUserProfileStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBeNull()
  })

  it('should pass enabled=false when unauthenticated', async () => {
    mockCurrentUser.value = null
    const { useUserProfileStore } = await import(
      '@/features/user/presentation/stores/user-profile-store'
    )
    useUserProfileStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.enabled()).toBe(false)
  })

  it('should pass channel key user-profile-<uid> when authenticated', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useUserProfileStore } = await import(
      '@/features/user/presentation/stores/user-profile-store'
    )
    useUserProfileStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBe('user-profile-user-abc')
  })

  it('should wire single binding on user_profile filtered by id (not user_id)', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useUserProfileStore } = await import(
      '@/features/user/presentation/stores/user-profile-store'
    )
    useUserProfileStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    const bindings = opts.bindings()
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      event: '*',
      table: 'user_profile',
      filter: 'id=eq.user-abc',
    })
    // Regression guard: must NOT filter by user_id
    expect(bindings[0].filter).not.toContain('user_id')
  })

  it('sign-out watcher calls clear() — profile nulled', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useUserProfileStore } = await import(
      '@/features/user/presentation/stores/user-profile-store'
    )
    const store = useUserProfileStore()

    mockCurrentUser.value = null
    store.clear()

    expect(store.profile).toBeNull()
  })
})
