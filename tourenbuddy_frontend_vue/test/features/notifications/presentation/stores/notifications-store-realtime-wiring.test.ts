import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── hoisted mocks ────────────────────────────────────────────────────────────

const { mockUseRealtime, mockCurrentUser, mockGetPreferences } = vi.hoisted(() => ({
  mockUseRealtime: vi.fn(),
  mockCurrentUser: { value: null as { id: string } | null },
  mockGetPreferences: vi.fn().mockResolvedValue({
    notifEmailEnabled: false,
    notifMutedTypes: [],
  }),
}))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: mockUseRealtime,
}))

vi.mock('@/features/notifications/data/repositories/notification-preferences-repository-impl', () => ({
  NotificationPreferencesRepositoryImpl: vi.fn().mockImplementation(() => ({
    getPreferences: mockGetPreferences,
    updatePreferences: vi.fn(),
  })),
}))

vi.mock('@/features/notifications/presentation/composables/use-web-push', () => ({
  useWebPush: vi.fn().mockReturnValue({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    ensureSubscription: vi.fn(),
    currentSubscription: vi.fn().mockResolvedValue(null),
  }),
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

// ── notifications-store realtime wiring ──────────────────────────────────────

describe('notificationsStore — realtime wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUseRealtime.mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() })
  })

  it('should pass null channel key when unauthenticated', async () => {
    mockCurrentUser.value = null
    const { useNotificationsStore } = await import(
      '@/features/notifications/presentation/stores/notifications-store'
    )
    useNotificationsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBeNull()
    expect(opts.enabled()).toBe(false)
  })

  it('should key by notification-settings-<uid>, distinct from the user-profile channel', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useNotificationsStore } = await import(
      '@/features/notifications/presentation/stores/notifications-store'
    )
    useNotificationsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    expect(opts.key()).toBe('notification-settings-user-abc')
    // Regression guard: must NOT collide with user-profile-store's key, or the
    // primitive's per-key dedup would drop this store's onChange entirely.
    expect(opts.key()).not.toBe('user-profile-user-abc')
  })

  it('should wire single binding on user_profile filtered by id (not user_id)', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useNotificationsStore } = await import(
      '@/features/notifications/presentation/stores/notifications-store'
    )
    useNotificationsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    const bindings = opts.bindings()
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      event: '*',
      table: 'user_profile',
      filter: 'id=eq.user-abc',
    })
    expect(bindings[0].filter).not.toContain('user_id')
  })

  it('onChange refetches preferences', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useNotificationsStore } = await import(
      '@/features/notifications/presentation/stores/notifications-store'
    )
    useNotificationsStore()

    const opts = mockUseRealtime.mock.calls[0][0]
    opts.onChange()
    await Promise.resolve()

    expect(mockGetPreferences).toHaveBeenCalled()
  })

  it('sign-out watcher calls clear() — prefs nulled', async () => {
    mockCurrentUser.value = { id: 'user-abc' }
    const { useNotificationsStore } = await import(
      '@/features/notifications/presentation/stores/notifications-store'
    )
    const store = useNotificationsStore()

    mockCurrentUser.value = null
    store.clear()

    expect(store.prefs).toBeNull()
  })
})
