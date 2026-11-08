import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionUnverified } from '@/core/auth/session-trust'
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store'

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}))

vi.mock('@/features/i18n/presentation/stores/use-locale-store', () => ({
  useLocaleStore: vi.fn(() => ({ locale: 'en' })),
}))

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should start with no user and loading state', () => {
    const store = useAuthStore()
    expect(store.currentUser).toBeNull()
    expect(store.isLoading).toBe(true)
    expect(store.isAuthenticated).toBe(false)
  })

  it('should set isLoading to false after initialize with no session', async () => {
    const { supabase } = await import('@/core/utils/supabase')
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)

    const store = useAuthStore()
    await store.initialize()

    expect(store.isLoading).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('should call signInWithOtp without emailRedirectTo for en locale', async () => {
    const { supabase } = await import('@/core/utils/supabase')
    const { useLocaleStore } = await import('@/features/i18n/presentation/stores/use-locale-store')
    vi.mocked(useLocaleStore).mockReturnValue({ locale: 'en' } as never)

    const store = useAuthStore()
    await store.sendEmailOtp('test@example.com')

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: {
        data: { locale: 'en' },
      },
    })
  })

  it('should call signInWithOtp with de locale for de-CH active locale', async () => {
    const { supabase } = await import('@/core/utils/supabase')
    const { useLocaleStore } = await import('@/features/i18n/presentation/stores/use-locale-store')
    vi.mocked(useLocaleStore).mockReturnValue({ locale: 'de-CH' } as never)

    const store = useAuthStore()
    await store.sendEmailOtp('test@example.com')

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: {
        data: { locale: 'de' },
      },
    })
  })

  it('should throw when sendEmailOtp returns an error', async () => {
    const { supabase } = await import('@/core/utils/supabase')
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValue({
      error: new Error('rate limited'),
    } as never)

    const store = useAuthStore()
    await expect(store.sendEmailOtp('test@example.com')).rejects.toThrow('rate limited')
  })

  it('should call verifyOtp with correct shape', async () => {
    const { supabase } = await import('@/core/utils/supabase')

    const store = useAuthStore()
    await store.verifyOtp('test@example.com', '123456')

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'test@example.com',
      token: '123456',
      type: 'email',
    })
  })

  it('should throw when verifyOtp returns an error', async () => {
    const { supabase } = await import('@/core/utils/supabase')
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      error: new Error('invalid token'),
    } as never)

    const store = useAuthStore()
    await expect(store.verifyOtp('test@example.com', '000000')).rejects.toThrow('invalid token')
  })

  it('should clear user on sign out', async () => {
    const store = useAuthStore()
    await store.signOut()

    expect(store.currentUser).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('should call signOut with scope local', async () => {
    const { supabase } = await import('@/core/utils/supabase')
    const store = useAuthStore()
    await store.signOut()
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('should not clear tb.locale from localStorage on sign out', async () => {
    localStorage.setItem('tb.locale', 'de-CH')
    const store = useAuthStore()
    await store.signOut()
    expect(localStorage.getItem('tb.locale')).toBe('de-CH')
    localStorage.removeItem('tb.locale')
  })

  describe('session restore when the token refresh is unreachable', () => {
    const STORAGE_KEY = 'sb-abcdefg-auth-token'

    function persist(value: unknown) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    }

    async function failGetSession(error: { name: string }) {
      const { supabase } = await import('@/core/utils/supabase')
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error,
      } as never)
    }

    beforeEach(() => {
      localStorage.removeItem(STORAGE_KEY)
      sessionUnverified.value = false
    })

    it('adopts the persisted user when the refresh fails retryably', async () => {
      await failGetSession({ name: 'AuthRetryableFetchError' })
      persist({ refresh_token: 'r1', user: { id: 'user-1' } })

      const store = useAuthStore()
      await store.initialize()

      expect(store.isAuthenticated).toBe(true)
      expect(store.currentUser?.id).toBe('user-1')
      expect(sessionUnverified.value).toBe(true)
    })

    it('stays signed out when the refresh fails permanently', async () => {
      await failGetSession({ name: 'AuthApiError' })
      persist({ refresh_token: 'r1', user: { id: 'user-1' } })

      const store = useAuthStore()
      await store.initialize()

      expect(store.isAuthenticated).toBe(false)
      expect(sessionUnverified.value).toBe(false)
    })

    it('stays signed out (and does not throw) when the stored session is malformed', async () => {
      await failGetSession({ name: 'AuthRetryableFetchError' })
      localStorage.setItem(STORAGE_KEY, '{not json')

      const store = useAuthStore()
      await expect(store.initialize()).resolves.toBeUndefined()

      expect(store.isAuthenticated).toBe(false)
      expect(sessionUnverified.value).toBe(false)
    })

    it('stays signed out when the stored session has no refresh token to revive', async () => {
      await failGetSession({ name: 'AuthRetryableFetchError' })
      persist({ user: { id: 'user-1' } })

      const store = useAuthStore()
      await store.initialize()

      expect(store.isAuthenticated).toBe(false)
    })

    async function initializeWithEmitter() {
      const { supabase } = await import('@/core/utils/supabase')
      await failGetSession({ name: 'AuthRetryableFetchError' })
      persist({ refresh_token: 'r1', user: { id: 'user-1' } })
      let emit: ((event: string, session: unknown) => void) | undefined
      vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(((cb: never) => {
        emit = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }) as never)

      const store = useAuthStore()
      await store.initialize()
      return { store, emit: emit! }
    }

    it('clears the adopted user and the unverified flag on SIGNED_OUT', async () => {
      const { store, emit } = await initializeWithEmitter()

      emit('SIGNED_OUT', null)

      expect(store.currentUser).toBeNull()
      expect(sessionUnverified.value).toBe(false)
    })

    it('adopts without waiting out the refresh retries when the session check stalls', async () => {
      // auth-js retries an unreachable refresh for a full 30s tick before resolving. The
      // app cannot mount until initialize() returns, so a stalled check must not be waited
      // on — a blank screen for half a minute is indistinguishable from a broken app.
      const { supabase } = await import('@/core/utils/supabase')
      vi.useFakeTimers()
      vi.mocked(supabase.auth.getSession).mockReturnValue(new Promise(() => {}) as never)
      persist({ refresh_token: 'r1', user: { id: 'user-1' } })

      const store = useAuthStore()
      const done = store.initialize()
      await vi.advanceTimersByTimeAsync(4000)
      await done

      expect(store.currentUser?.id).toBe('user-1')
      expect(sessionUnverified.value).toBe(true)
      expect(store.isLoading).toBe(false)
      vi.useRealTimers()
    })

    it('signs out locally even when the server is unreachable, so a reboot cannot re-adopt', async () => {
      const { supabase } = await import('@/core/utils/supabase')
      const { store } = await initializeWithEmitter()
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: { name: 'AuthRetryableFetchError' },
      } as never)

      await expect(store.signOut()).resolves.toBeUndefined() // must not throw offline

      expect(store.currentUser).toBeNull()
      expect(sessionUnverified.value).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull() // else the next cold start adopts it
    })

    it('keeps the adopted user when INITIAL_SESSION replays the same failed refresh as null', async () => {
      // auth-js re-runs the session load for every new subscriber; offline that repeats the
      // refresh that already failed and delivers INITIAL_SESSION(null). Taking it at face
      // value would undo the adoption and bounce the user to the sign-in form.
      const { store, emit } = await initializeWithEmitter()

      emit('INITIAL_SESSION', null)

      expect(store.currentUser?.id).toBe('user-1')
      expect(sessionUnverified.value).toBe(true)
    })

    it('upgrades the adopted user to verified once a real session arrives', async () => {
      const { store, emit } = await initializeWithEmitter()

      emit('TOKEN_REFRESHED', { user: { id: 'user-1', email: 'a@b.ch' } })

      expect(store.currentUser?.email).toBe('a@b.ch')
      expect(sessionUnverified.value).toBe(false)
    })
  })
})
