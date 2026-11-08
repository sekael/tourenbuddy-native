import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store'
import UserProfileSheet from '@/features/user/presentation/components/user-profile-sheet.vue'

const { mockUpdateProfile, mockSendPhoneVerification, mockCheckPhoneAvailability, mockDeletePhone, mockSignOut, mockFullProfile, mockStoreError } = vi.hoisted(
  () => ({
    mockUpdateProfile: vi.fn(),
    mockSendPhoneVerification: vi.fn(),
    mockCheckPhoneAvailability: vi.fn().mockResolvedValue(undefined),
    mockDeletePhone: vi.fn().mockResolvedValue(undefined),
    mockSignOut: vi.fn(),
    mockFullProfile: {
      value: {
        id: 'user-123',
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'max@example.com',
        phoneNumber: null as string | null,
        phoneVerified: false,
      },
    },
    mockStoreError: { value: null as string | null },
  }),
)

const { mockSetLocale, mockLocale, mockFeeds } = vi.hoisted(() => ({
  mockSetLocale: vi.fn(),
  mockLocale: { value: 'en' },
  mockFeeds: { value: [] as { id: string, lastError: string | null }[] },
}))

vi.mock('@/features/calendar/presentation/stores/calendar-feed-store', () => ({
  useCalendarFeedStore: () => ({
    get feeds() {
      return mockFeeds.value
    },
    loadFeeds: vi.fn(),
  }),
}))

vi.mock('@/features/user/presentation/stores/user-profile-store', () => ({
  useUserProfileStore: vi.fn().mockReturnValue({
    get fullProfile() {
      return mockFullProfile.value
    },
    get error() {
      return mockStoreError.value
    },
    updateProfile: mockUpdateProfile,
    sendPhoneVerification: mockSendPhoneVerification,
    checkPhoneAvailability: mockCheckPhoneAvailability,
    deletePhone: mockDeletePhone,
    clear: vi.fn(),
  }),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    currentUser: { email: 'max@example.com' },
    signOut: mockSignOut,
  }),
}))

vi.mock('@/features/contacts/presentation/stores/contacts-store', () => ({
  useContactsStore: vi.fn().mockReturnValue({ clear: vi.fn() }),
}))

vi.mock('@/features/tours/presentation/stores/tours-store', () => ({
  useToursStore: vi.fn().mockReturnValue({ clear: vi.fn() }),
}))

vi.mock('@/features/i18n/presentation/stores/use-locale-store', () => ({
  useLocaleStore: vi.fn().mockReturnValue({
    get locale() {
      return mockLocale.value
    },
    setLocale: mockSetLocale,
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, named?: { count?: number }) => named?.count === undefined ? key : `${key}:${named.count}` }),
}))

vi.mock('@/features/user/presentation/components/phone-verification-dialog.vue', () => ({
  default: { template: '<div class="phone-verification-stub" />' },
}))

vi.mock('@/features/friendships/presentation/components/phone-verification-notice.vue', () => ({
  default: {
    emits: ['acknowledged', 'close'],
    template:
      '<div class="verification-notice-stub"><button class="ack-btn" @click="$emit(\'acknowledged\')">Ack</button></div>',
  },
}))

vi.mock('@/features/friendships/presentation/stores/friendships-store', () => ({
  useFriendshipsStore: vi.fn().mockReturnValue({
    friendUserIds: { value: new Set() },
    isPhoneVerified: { value: false },
    incomingRequests: { value: [] },
    outgoingRequests: { value: [] },
    friendships: { value: [] },
    isLoading: { value: false },
    error: { value: null },
    fetchAll: vi.fn(),
    clear: vi.fn(),
    currentUserHasAnyRelationship: vi.fn().mockReturnValue({ hasPending: false, hasFriendship: false }),
  }),
}))

vi.mock('@/core/components/bottom-sheet.vue', () => ({
  default: {
    template: '<div class="bottom-sheet-stub"><slot /></div>',
    props: ['title'],
    emits: ['close'],
  },
}))

vi.mock('@/core/components/adaptive-overlay.vue', () => ({
  default: {
    template: '<div class="adaptive-overlay-stub"><slot /></div>',
    props: ['title'],
    emits: ['close'],
  },
}))

describe('userProfileSheet', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockLocale.value = 'en'
    mockFeeds.value = []
    mockStoreError.value = null
    mockDeletePhone.mockResolvedValue(undefined)
    mockCheckPhoneAvailability.mockResolvedValue(undefined)
    mockFullProfile.value = {
      id: 'user-123',
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.com',
      phoneNumber: null,
      phoneVerified: false,
    }
  })

  it('should display user name and email in view mode', () => {
    const wrapper = mount(UserProfileSheet)
    expect(wrapper.text()).toContain('Max Mustermann')
    expect(wrapper.text()).toContain('max@example.com')
  })

  it('should prompt to add a phone number when none is set', () => {
    const wrapper = mount(UserProfileSheet)
    expect(wrapper.find('[data-testid="phone-status"]').text()).toBe('user.profile.addPhoneBtn')
  })

  it('should show phone number with verified badge when phone is verified', () => {
    mockFullProfile.value = {
      ...mockFullProfile.value,
      phoneNumber: '+41791234567',
      phoneVerified: true,
    }
    const wrapper = mount(UserProfileSheet)
    expect(wrapper.text()).toContain('+41 79 123 45 67')
    expect(wrapper.find('.verified-icon').exists()).toBe(true)
  })

  it('should flag an unverified phone number', () => {
    mockFullProfile.value = {
      ...mockFullProfile.value,
      phoneNumber: '+41791234567',
      phoneVerified: false,
    }
    const wrapper = mount(UserProfileSheet)
    expect(wrapper.find('[data-testid="phone-status"]').text()).toContain('user.profile.notVerified')
    expect(wrapper.find('.verified-icon').exists()).toBe(false)
  })

  describe('overview summaries', () => {
    it('should report notifications off when push and email are both disabled', () => {
      useNotificationsStore().prefs = { notifEmailEnabled: false, notifMutedTypes: [] }
      const wrapper = mount(UserProfileSheet)
      expect(wrapper.text()).toContain('user.profile.notificationsSummary.off')
    })

    it('should report a sync problem when any calendar feed failed', () => {
      mockFeeds.value = [{ id: 'a', lastError: null }, { id: 'b', lastError: 'timeout' }]
      const wrapper = mount(UserProfileSheet)
      expect(wrapper.find('.row-value--alert').text()).toBe('user.profile.calendarProblem')
    })

    it('should report no connected calendars as a zero count', () => {
      const wrapper = mount(UserProfileSheet)
      expect(wrapper.text()).toContain('user.profile.calendarSummary:0')
    })
  })

  it('should switch to edit mode when Edit profile button is clicked', async () => {
    const wrapper = mount(UserProfileSheet)
    await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
    expect(wrapper.find('#edit-first-name').exists()).toBe(true)
    expect(wrapper.find('#edit-last-name').exists()).toBe(true)
  })

  it('should populate edit form with current profile values', async () => {
    const wrapper = mount(UserProfileSheet)
    await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
    expect((wrapper.find('#edit-first-name').element as HTMLInputElement).value).toBe('Max')
    expect((wrapper.find('#edit-last-name').element as HTMLInputElement).value).toBe('Mustermann')
  })

  it('should cancel edit and return to view mode', async () => {
    const wrapper = mount(UserProfileSheet)
    await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
    await wrapper.find('.edit-actions .base-button--secondary').trigger('click')
    expect(wrapper.find('[data-testid="edit-profile-btn"]').exists()).toBe(true)
    expect(wrapper.find('#edit-first-name').exists()).toBe(false)
  })

  it('should call updateProfile on save with changed name fields', async () => {
    mockUpdateProfile.mockResolvedValue(undefined)
    const wrapper = mount(UserProfileSheet)
    await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
    await wrapper.find('#edit-first-name').setValue('Hans')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({ firstName: 'Hans', lastName: 'Mustermann' }),
    )
  })

  it('should trigger phone verification when phone is changed on save', async () => {
    mockUpdateProfile.mockResolvedValue(undefined)
    mockSendPhoneVerification.mockResolvedValue(undefined)
    const wrapper = mount(UserProfileSheet)
    await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
    await wrapper.find('#edit-phone').setValue('+41791234567')
    await wrapper.find('form').trigger('submit')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.verification-notice-stub').exists()).toBe(true)
    expect(mockSendPhoneVerification).not.toHaveBeenCalled()
    await wrapper.find('.ack-btn').trigger('click')
    await vi.waitFor(() => expect(mockSendPhoneVerification).toHaveBeenCalledWith('+41791234567'))
    expect(wrapper.find('.phone-verification-stub').exists()).toBe(true)
  })

  describe('remove phone', () => {
    it('verified phone: tapping remove shows inline confirmation with disclaimer', async () => {
      mockFullProfile.value = {
        ...mockFullProfile.value,
        phoneNumber: '+41791234567',
        phoneVerified: true,
      }
      const wrapper = mount(UserProfileSheet)
      await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
      await wrapper.find('[data-testid="remove-phone-btn"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.remove-phone-confirm').exists()).toBe(true)
      expect(wrapper.text()).toContain('user.profile.removePhoneDisclaimer')
      expect(mockDeletePhone).not.toHaveBeenCalled()
    })

    it('unverified phone: tapping remove calls deletePhone directly without overlay', async () => {
      mockFullProfile.value = {
        ...mockFullProfile.value,
        phoneNumber: '+41791234567',
        phoneVerified: false,
      }
      const wrapper = mount(UserProfileSheet)
      await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
      await wrapper.find('[data-testid="remove-phone-btn"]').trigger('click')
      await vi.waitFor(() => expect(mockDeletePhone).toHaveBeenCalled())
      expect(wrapper.text()).not.toContain('user.profile.removePhoneDisclaimer')
    })
  })

  describe('language selector', () => {
    it('should mark exactly the current locale as pressed', () => {
      mockLocale.value = 'de-CH'
      const wrapper = mount(UserProfileSheet)
      const pressed = wrapper.findAll('.language button[aria-pressed="true"]')
      expect(pressed.map(b => b.text())).toEqual(['Deutsch'])
    })

    it('should call setLocale when a language button is clicked', async () => {
      const wrapper = mount(UserProfileSheet)
      const buttons = wrapper.findAll('.language button')
      const deBtn = buttons.find(b => b.text().includes('Deutsch'))
      expect(deBtn).toBeDefined()
      await deBtn!.trigger('click')
      expect(mockSetLocale).toHaveBeenCalledWith('de-CH')
    })
  })
})
