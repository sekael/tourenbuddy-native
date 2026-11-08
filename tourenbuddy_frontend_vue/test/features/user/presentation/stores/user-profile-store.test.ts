import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { pace } from '@/core/composables/use-pace'
import { InvalidPhoneNumberError, PhoneAlreadyRegisteredError } from '@/core/exceptions'
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store'

const { mockGetUserById, mockUpsertProfile } = vi.hoisted(() => ({
  mockGetUserById: vi.fn(),
  mockUpsertProfile: vi.fn(),
}))

const mockCurrentUser = vi.hoisted(() => ({
  value: {
    id: 'user-123',
    email: 'test@example.com',
    phone: null as string | null,
    phone_confirmed_at: null as string | null,
  },
}))

vi.mock('@/features/user/data/repositories/user-profile-repository-impl', () => ({
  UserProfileRepositoryImpl: vi.fn().mockImplementation(() => ({
    getUserById: mockGetUserById,
    upsertProfile: mockUpsertProfile,
  })),
}))

const mockRefreshCurrentUser = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    get currentUser() {
      return mockCurrentUser.value
    },
    refreshCurrentUser: mockRefreshCurrentUser,
  }),
}))

const { mockUpdateUser, mockVerifyOtp, mockRpc } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn().mockResolvedValue({ error: null }),
  mockVerifyOtp: vi.fn().mockResolvedValue({ error: null }),
  mockRpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}))

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    auth: {
      updateUser: mockUpdateUser,
      verifyOtp: mockVerifyOtp,
    },
    rpc: mockRpc,
  },
}))

const mockLocaleStoreSetLocale = vi.hoisted(() => vi.fn())
const mockLocaleStoreLocale = vi.hoisted(() => ({ value: 'en' }))

vi.mock('@/core/realtime/use-realtime-subscription', () => ({
  useRealtimeSubscription: vi.fn().mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() }),
}))

vi.mock('@/core/realtime/use-realtime-broadcast', () => ({
  useRealtimeBroadcast: vi.fn().mockReturnValue({ status: { value: 'idle' }, stop: vi.fn() }),
}))

vi.mock('@/features/i18n/presentation/stores/use-locale-store', () => ({
  useLocaleStore: () => ({
    get locale() { return mockLocaleStoreLocale.value },
    setLocale: mockLocaleStoreSetLocale,
  }),
}))

describe('useUserProfileStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockCurrentUser.value = {
      id: 'user-123',
      email: 'test@example.com',
      phone: null,
      phone_confirmed_at: null,
    }
    mockLocaleStoreLocale.value = 'en'
  })
  // The pace is module state: a store left alive would answer the next test's pace changes.
  afterEach(() => useUserProfileStore().$dispose())

  describe('loadProfile', () => {
    it('should load existing profile', async () => {
      const mockProfile = { id: 'user-123', firstName: 'Max', lastName: 'Mustermann', locale: 'en' as const }
      mockGetUserById.mockResolvedValue(mockProfile)

      const store = useUserProfileStore()
      await store.loadProfile()

      expect(store.profile).toEqual(mockProfile)
      expect(store.isLoading).toBe(false)
      expect(store.error).toBeNull()
    })

    it('should create profile when none exists', async () => {
      const newProfile = { id: 'user-123', firstName: null, lastName: null, locale: null }
      mockGetUserById.mockResolvedValue(null)
      mockUpsertProfile.mockResolvedValue(newProfile)

      const store = useUserProfileStore()
      await store.loadProfile()

      expect(mockUpsertProfile).toHaveBeenCalledWith({
        id: 'user-123',
        firstName: null,
        lastName: null,
        locale: null,
        onboardingTourShowAtSignIn: true,
        onboardingTourLastStep: 0,
        calendarTourShowOnFirstOpen: true,
        calendarFeatureNoticeShowAtSignIn: false,
        pace: 1,
        updatedAt: null,
      })
      expect(store.profile).toEqual(newProfile)
    })

    it('should set error on failure', async () => {
      mockGetUserById.mockRejectedValue(new Error('DB error'))

      const store = useUserProfileStore()
      await store.loadProfile()

      expect(store.error).toBe('DB error')
      expect(store.profile).toBeNull()
    })

    it('should call setLocale when profile.locale differs from active locale', async () => {
      mockLocaleStoreLocale.value = 'en'
      const mockProfile = { id: 'user-123', firstName: null, lastName: null, locale: 'de-CH' as const }
      mockGetUserById.mockResolvedValue(mockProfile)

      const store = useUserProfileStore()
      await store.loadProfile()

      expect(mockLocaleStoreSetLocale).toHaveBeenCalledWith('de-CH')
    })

    it('should not call setLocale when profile.locale matches active locale', async () => {
      mockLocaleStoreLocale.value = 'en'
      const mockProfile = { id: 'user-123', firstName: null, lastName: null, locale: 'en' as const }
      mockGetUserById.mockResolvedValue(mockProfile)

      const store = useUserProfileStore()
      await store.loadProfile()

      expect(mockLocaleStoreSetLocale).not.toHaveBeenCalled()
    })

    it('should seed server locale when profile.locale is null', async () => {
      mockLocaleStoreLocale.value = 'de-CH'
      const mockProfile = { id: 'user-123', firstName: null, lastName: null, locale: null }
      const seededProfile = { ...mockProfile, locale: 'de-CH' as const }
      mockGetUserById.mockResolvedValue(mockProfile)
      mockUpsertProfile.mockResolvedValue(seededProfile)

      const store = useUserProfileStore()
      await store.loadProfile()

      await vi.waitFor(() => expect(mockUpsertProfile).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'de-CH' }),
      ))
    })
  })

  describe('fullProfile', () => {
    it('should return null when profile is not loaded', () => {
      const store = useUserProfileStore()
      expect(store.fullProfile).toBeNull()
    })

    it('should merge profile and auth data', async () => {
      mockGetUserById.mockResolvedValue({
        id: 'user-123',
        firstName: 'Max',
        lastName: 'Mustermann',
        locale: 'en',
      })
      mockCurrentUser.value = {
        id: 'user-123',
        email: 'test@example.com',
        phone: '+41791234567',
        phone_confirmed_at: '2024-01-01T00:00:00Z',
      }

      const store = useUserProfileStore()
      await store.loadProfile()

      expect(store.fullProfile).toEqual({
        id: 'user-123',
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'test@example.com',
        phoneNumber: '+41791234567',
        phoneVerified: true,
      })
    })

    it('should show phoneVerified false when phone not confirmed', async () => {
      mockGetUserById.mockResolvedValue({
        id: 'user-123',
        firstName: 'Max',
        lastName: 'Mustermann',
        locale: 'en',
      })
      mockCurrentUser.value = {
        id: 'user-123',
        email: 'test@example.com',
        phone: '+41791234567',
        phone_confirmed_at: null,
      }

      const store = useUserProfileStore()
      await store.loadProfile()

      expect(store.fullProfile?.phoneVerified).toBe(false)
    })
  })

  describe('updateProfile', () => {
    it('should call upsertProfile with merged fields', async () => {
      const existing = { id: 'user-123', firstName: 'Max', lastName: null, locale: 'en' as const }
      mockGetUserById.mockResolvedValue(existing)
      mockUpsertProfile.mockResolvedValue({ id: 'user-123', firstName: 'Max', lastName: 'Doe', locale: 'en' as const })

      const store = useUserProfileStore()
      await store.loadProfile()
      await store.updateProfile({ lastName: 'Doe' })

      expect(mockUpsertProfile).toHaveBeenLastCalledWith({
        id: 'user-123',
        firstName: 'Max',
        lastName: 'Doe',
        locale: 'en',
      })
    })
  })

  describe('pace', () => {
    const existing = { id: 'user-123', firstName: 'Max', lastName: null, locale: 'en' as const }
    beforeEach(() => {
      pace.value = 1
      vi.useFakeTimers()
    })
    afterEach(() => vi.useRealTimers())

    it('should write a slider drag once, where it came to rest', async () => {
      mockGetUserById.mockResolvedValue({ ...existing, pace: 1 })
      mockUpsertProfile.mockImplementation(async p => p)
      const store = useUserProfileStore()
      await store.loadProfile()

      for (const step of [1.1, 1.2, 1.3]) {
        pace.value = step
        await nextTick()
      }
      await vi.advanceTimersByTimeAsync(600)

      expect(mockUpsertProfile).toHaveBeenCalledOnce()
      expect(mockUpsertProfile).toHaveBeenCalledWith(expect.objectContaining({ pace: 1.3 }))
    })

    it('should take the account\'s pace without writing it back', async () => {
      mockGetUserById.mockResolvedValue({ ...existing, pace: 0.8 })
      const store = useUserProfileStore()
      await store.loadProfile()
      await vi.advanceTimersByTimeAsync(600)

      expect(pace.value).toBe(0.8)
      expect(mockUpsertProfile).not.toHaveBeenCalled()
    })
  })

  describe('onboarding tour actions', () => {
    const base = {
      id: 'user-123',
      firstName: null,
      lastName: null,
      locale: 'en' as const,
      onboardingTourShowAtSignIn: true,
      onboardingTourLastStep: 0,
      calendarTourShowOnFirstOpen: true,
      calendarFeatureNoticeShowAtSignIn: false,
      updatedAt: null,
    }

    it('saveTourStep persists the resume index', async () => {
      mockGetUserById.mockResolvedValue(base)
      mockUpsertProfile.mockResolvedValue({ ...base, onboardingTourLastStep: 3 })
      const store = useUserProfileStore()
      await store.loadProfile()

      await store.saveTourStep(3)

      expect(mockUpsertProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({ onboardingTourLastStep: 3 }),
      )
    })

    it('dismissTourAtSignIn flips the gate off', async () => {
      mockGetUserById.mockResolvedValue(base)
      mockUpsertProfile.mockResolvedValue({ ...base, onboardingTourShowAtSignIn: false })
      const store = useUserProfileStore()
      await store.loadProfile()

      await store.dismissTourAtSignIn()

      expect(mockUpsertProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({ onboardingTourShowAtSignIn: false }),
      )
    })

    it('swallows a persistence failure instead of throwing', async () => {
      mockGetUserById.mockResolvedValue(base)
      const store = useUserProfileStore()
      await store.loadProfile()
      mockUpsertProfile.mockRejectedValueOnce(new Error('network'))

      await expect(store.saveTourStep(2)).resolves.toBeUndefined()
    })

    it('dismissCalendarFeatureNotice flips only the notice gate off', async () => {
      mockGetUserById.mockResolvedValue({ ...base, calendarFeatureNoticeShowAtSignIn: true })
      mockUpsertProfile.mockResolvedValue({ ...base, calendarFeatureNoticeShowAtSignIn: false })
      const store = useUserProfileStore()
      await store.loadProfile()

      await store.dismissCalendarFeatureNotice()

      expect(mockUpsertProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({
          calendarFeatureNoticeShowAtSignIn: false,
          updatedAt: null,
          calendarTourShowOnFirstOpen: true,
        }),
      )
    })
  })

  describe('skipOnboarding', () => {
    it('should set sessionSkipped to true', () => {
      const store = useUserProfileStore()
      expect(store.sessionSkipped).toBe(false)
      store.skipOnboarding()
      expect(store.sessionSkipped).toBe(true)
    })
  })

  describe('clear', () => {
    it('should clear profile on sign out', async () => {
      const store = useUserProfileStore()
      store.profile = {
        id: 'user-123',
        firstName: 'Max',
        lastName: null,
        locale: null,
        onboardingTourShowAtSignIn: true,
        onboardingTourLastStep: 0,
        calendarTourShowOnFirstOpen: true,
        calendarFeatureNoticeShowAtSignIn: false,
        updatedAt: null,
      }
      store.clear()

      expect(store.profile).toBeNull()
    })

    it('should reset sessionSkipped on clear', () => {
      const store = useUserProfileStore()
      store.skipOnboarding()
      store.clear()
      expect(store.sessionSkipped).toBe(false)
    })
  })

  describe('phone normalization', () => {
    it('sends E.164 to Supabase Auth for Swiss national number', async () => {
      const store = useUserProfileStore()
      await store.sendPhoneVerification('0791234567')
      expect(mockUpdateUser).toHaveBeenCalledWith({ phone: '+41791234567' })
    })

    it('sends E.164 to Supabase Auth for canonical international number', async () => {
      const store = useUserProfileStore()
      await store.sendPhoneVerification('+41 79 123 45 67')
      expect(mockUpdateUser).toHaveBeenCalledWith({ phone: '+41791234567' })
    })

    it('throws InvalidPhoneNumberError for unparseable phone', async () => {
      const store = useUserProfileStore()
      await expect(store.sendPhoneVerification('not-a-number')).rejects.toBeInstanceOf(
        InvalidPhoneNumberError,
      )
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('verifyPhone sends E.164 to Supabase Auth', async () => {
      const store = useUserProfileStore()
      await store.verifyPhone('+41 79 123 45 67', '123456')
      expect(mockVerifyOtp).toHaveBeenCalledWith(expect.objectContaining({ phone: '+41791234567' }))
    })
  })

  describe('checkPhoneAvailability', () => {
    it('throws PhoneAlreadyRegisteredError when is_phone_registered returns true', async () => {
      mockRpc.mockResolvedValueOnce({ data: true, error: null })

      const store = useUserProfileStore()
      await expect(store.checkPhoneAvailability('+41791234567')).rejects.toBeInstanceOf(
        PhoneAlreadyRegisteredError,
      )
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('resolves when is_phone_registered returns false', async () => {
      mockRpc.mockResolvedValueOnce({ data: false, error: null })

      const store = useUserProfileStore()
      await expect(store.checkPhoneAvailability('+41791234567')).resolves.toBeUndefined()
    })

    it('runs RPC even when caller is not phone-verified', async () => {
      mockRpc.mockResolvedValueOnce({ data: false, error: null })

      const store = useUserProfileStore()
      await store.checkPhoneAvailability('+41791234567')
      expect(mockRpc).toHaveBeenCalledWith('is_phone_registered', { p_phone: '+41791234567' })
    })
  })

  describe('sendPhoneVerification fallback', () => {
    it('throws PhoneAlreadyRegisteredError when updateUser returns already-registered error', async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: { message: 'User already registered' } })

      const store = useUserProfileStore()
      await expect(store.sendPhoneVerification('+41791234567')).rejects.toBeInstanceOf(
        PhoneAlreadyRegisteredError,
      )
    })

    it('propagates unrelated updateUser error unchanged', async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: { message: 'Rate limit exceeded' } })

      const store = useUserProfileStore()
      await expect(store.sendPhoneVerification('+41791234567')).rejects.toThrow('Rate limit exceeded')
    })
  })

  describe('deletePhone', () => {
    it('propagates RPC error to store.error', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })

      const store = useUserProfileStore()
      await store.deletePhone()

      expect(store.error).toBe('DB error')
      expect(mockRefreshCurrentUser).not.toHaveBeenCalled()
    })

    it('calls refreshSession on success and clears error', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: null })

      const store = useUserProfileStore()
      await store.deletePhone()

      expect(store.error).toBeNull()
      expect(mockRefreshCurrentUser).toHaveBeenCalled()
    })
  })
})
