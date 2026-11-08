import type { NotificationPreferences } from '@/features/notifications/domain/entities/notification-preferences'
import { createPinia, setActivePinia } from 'pinia'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store'

const { mockGetPrefs, mockUpdatePrefs, mockCurrentUser, webPush } = vi.hoisted(() => ({
  mockGetPrefs: vi.fn(),
  mockUpdatePrefs: vi.fn(),
  webPush: {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    ensureSubscription: vi.fn(),
    currentSubscription: vi.fn(),
  },
  mockCurrentUser: {
    value: null as { id: string } | null,
  },
}))

vi.mock('@/features/notifications/data/repositories/notification-preferences-repository-impl', () => ({
  NotificationPreferencesRepositoryImpl: vi.fn().mockImplementation(() => ({
    getPreferences: mockGetPrefs,
    updatePreferences: mockUpdatePrefs,
  })),
}))

vi.mock('@/features/notifications/presentation/composables/use-web-push', () => ({
  useWebPush: () => webPush,
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    get currentUser() {
      return mockCurrentUser.value
    },
  }),
}))

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

const defaultPrefs: NotificationPreferences = {
  notifEmailEnabled: true,
  notifMutedTypes: [],
}

describe('useNotificationsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockCurrentUser.value = null
    webPush.subscribe.mockResolvedValue(true)
    webPush.unsubscribe.mockResolvedValue(undefined)
    webPush.ensureSubscription.mockResolvedValue(false)
    webPush.currentSubscription.mockResolvedValue(null)
  })

  describe('per-device push (#148)', () => {
    it('should show push off on a device without its own subscription', async () => {
      mockCurrentUser.value = { id: 'user-1' }
      mockGetPrefs.mockResolvedValue(defaultPrefs)
      webPush.currentSubscription.mockResolvedValue(null)
      const store = useNotificationsStore()

      await store.loadPrefs()
      await Promise.resolve()

      expect(store.pushEnabled).toBe(false)
    })

    it('should never write an account-wide push flag when toggling', async () => {
      mockCurrentUser.value = { id: 'user-1' }
      const store = useNotificationsStore()
      store.prefs = { ...defaultPrefs }

      await store.setPushEnabled(true)
      await store.setPushEnabled(false)

      expect(mockUpdatePrefs).not.toHaveBeenCalled()
      expect(webPush.unsubscribe).toHaveBeenCalledTimes(1)
    })

    it('should keep push off when the browser denies the subscription', async () => {
      mockCurrentUser.value = { id: 'user-1' }
      webPush.subscribe.mockResolvedValue(false)
      const store = useNotificationsStore()

      await store.setPushEnabled(true)

      expect(store.pushEnabled).toBe(false)
    })

    it('should ignore the toggle offline instead of queueing it', async () => {
      const { isOnline } = await import('@/core/offline/use-online-status')
      mockCurrentUser.value = { id: 'user-1' }
      isOnline.value = false
      try {
        await useNotificationsStore().setPushEnabled(true)
        expect(webPush.subscribe).not.toHaveBeenCalled()
      }
      finally {
        isOnline.value = true
      }
    })

    it('should not block sign-out when the device cleanup hangs', async () => {
      vi.useFakeTimers()
      try {
        webPush.unsubscribe.mockReturnValue(new Promise(() => {}))
        const store = useNotificationsStore()
        const done = store.removeThisDevice()
        await vi.advanceTimersByTimeAsync(3000)
        await expect(done).resolves.toBeUndefined()
        expect(store.pushEnabled).toBe(false)
      }
      finally {
        vi.useRealTimers()
      }
    })
  })

  it('should have null prefs initially', () => {
    const store = useNotificationsStore()
    expect(store.prefs).toBeNull()
  })

  it('should load prefs on loadPrefs when authenticated', async () => {
    mockCurrentUser.value = { id: 'user-1' }
    mockGetPrefs.mockResolvedValue(defaultPrefs)

    const store = useNotificationsStore()
    await store.loadPrefs()

    expect(mockGetPrefs).toHaveBeenCalledWith('user-1')
    expect(store.prefs).toEqual(defaultPrefs)
  })

  it('should skip loadPrefs when not authenticated', async () => {
    mockCurrentUser.value = null
    const store = useNotificationsStore()
    await store.loadPrefs()
    expect(mockGetPrefs).not.toHaveBeenCalled()
  })

  it('should clear prefs on clear()', () => {
    const store = useNotificationsStore()
    store.prefs = defaultPrefs
    store.clear()
    expect(store.prefs).toBeNull()
  })

  it('should set error on loadPrefs failure', async () => {
    mockCurrentUser.value = { id: 'user-1' }
    mockGetPrefs.mockRejectedValue(new Error('network error'))

    const store = useNotificationsStore()
    await store.loadPrefs()

    expect(store.error).toBeTruthy()
    expect(store.prefs).toBeNull()
  })

  it('should not call updatePreferences if no prefs loaded yet', async () => {
    mockCurrentUser.value = { id: 'user-1' }
    const store = useNotificationsStore()
    // prefs is null
    await store.setEmailEnabled(false)
    expect(mockUpdatePrefs).not.toHaveBeenCalled()
  })

  it('should update email preference and persist', async () => {
    mockCurrentUser.value = { id: 'user-1' }
    mockUpdatePrefs.mockResolvedValue(undefined)
    const store = useNotificationsStore()
    store.prefs = { ...defaultPrefs }

    await store.setEmailEnabled(false)

    expect(mockUpdatePrefs).toHaveBeenCalledWith('user-1', expect.objectContaining({ notifEmailEnabled: false }))
    expect(store.prefs?.notifEmailEnabled).toBe(false)
  })

  it('should mute a type and persist', async () => {
    mockCurrentUser.value = { id: 'user-1' }
    mockUpdatePrefs.mockResolvedValue(undefined)
    const store = useNotificationsStore()
    store.prefs = { ...defaultPrefs, notifMutedTypes: [] }

    await store.setTypeMuted('friend_requests', true)

    expect(store.prefs?.notifMutedTypes).toContain('friend_requests')
  })

  it('should unmute a type and persist', async () => {
    mockCurrentUser.value = { id: 'user-1' }
    mockUpdatePrefs.mockResolvedValue(undefined)
    const store = useNotificationsStore()
    store.prefs = { ...defaultPrefs, notifMutedTypes: ['friend_requests'] }

    await store.setTypeMuted('friend_requests', false)

    expect(store.prefs?.notifMutedTypes).not.toContain('friend_requests')
  })
})
