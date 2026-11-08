import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserProfileSheet from '@/features/user/presentation/components/user-profile-sheet.vue'

const { mockCurrentUserHasAnyRelationship } = vi.hoisted(() => ({
  mockCurrentUserHasAnyRelationship: vi.fn(),
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
    currentUserHasAnyRelationship: mockCurrentUserHasAnyRelationship,
  }),
}))

vi.mock('@/features/user/presentation/stores/user-profile-store', () => ({
  useUserProfileStore: vi.fn().mockReturnValue({
    fullProfile: {
      id: 'user-123',
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.com',
      phoneNumber: '+41791234567',
      phoneVerified: true,
    },
    error: null,
    updateProfile: vi.fn(),
    sendPhoneVerification: vi.fn(),
    checkPhoneAvailability: vi.fn().mockResolvedValue(undefined),
    deletePhone: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  }),
}))

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn().mockReturnValue({
    currentUser: { email: 'max@example.com' },
    signOut: vi.fn(),
  }),
}))

vi.mock('@/features/contacts/presentation/stores/contacts-store', () => ({
  useContactsStore: vi.fn().mockReturnValue({ clear: vi.fn() }),
}))

vi.mock('@/features/tours/presentation/stores/tours-store', () => ({
  useToursStore: vi.fn().mockReturnValue({ clear: vi.fn() }),
}))

vi.mock('@/features/i18n/presentation/stores/use-locale-store', () => ({
  useLocaleStore: vi.fn().mockReturnValue({ locale: 'en', setLocale: vi.fn() }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/features/user/presentation/components/phone-verification-dialog.vue', () => ({
  default: { template: '<div class="phone-verification-stub" />' },
}))

vi.mock('@/features/friendships/presentation/components/phone-verification-notice.vue', () => ({
  default: {
    emits: ['acknowledged', 'close'],
    template: '<div class="verification-notice-stub" />',
  },
}))

vi.mock('@/core/components/adaptive-overlay.vue', () => ({
  default: {
    template: '<div class="adaptive-overlay-stub"><slot /></div>',
    props: ['title'],
    emits: ['close'],
  },
}))

vi.mock('@/features/notifications/presentation/components/notification-preferences-section.vue', () => ({
  default: { template: '<div />' },
}))

async function mountAndOpenRemoveConfirm() {
  const wrapper = mount(UserProfileSheet)
  await wrapper.find('[data-testid="edit-profile-btn"]').trigger('click')
  await wrapper.find('[data-testid="remove-phone-btn"]').trigger('click')
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('user-profile-sheet — remove-phone relationship warnings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should always show the reverify disclaimer', async () => {
    mockCurrentUserHasAnyRelationship.mockReturnValue({ hasPending: false, hasFriendship: false })
    const wrapper = await mountAndOpenRemoveConfirm()
    expect(wrapper.find('.remove-phone-confirm').exists()).toBe(true)
    expect(wrapper.text()).toContain('user.profile.removePhoneDisclaimer')
  })

  it('should not show relationship warning when no relationships exist', async () => {
    mockCurrentUserHasAnyRelationship.mockReturnValue({ hasPending: false, hasFriendship: false })
    const wrapper = await mountAndOpenRemoveConfirm()
    expect(wrapper.text()).not.toContain('user.profile.removePhonePendingWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhoneFriendshipWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhoneBothWarning')
  })

  it('should show friendship warning when only friendships exist', async () => {
    mockCurrentUserHasAnyRelationship.mockReturnValue({ hasPending: false, hasFriendship: true })
    const wrapper = await mountAndOpenRemoveConfirm()
    expect(wrapper.text()).toContain('user.profile.removePhoneFriendshipWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhonePendingWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhoneBothWarning')
  })

  it('should show pending warning when only pending requests exist', async () => {
    mockCurrentUserHasAnyRelationship.mockReturnValue({ hasPending: true, hasFriendship: false })
    const wrapper = await mountAndOpenRemoveConfirm()
    expect(wrapper.text()).toContain('user.profile.removePhonePendingWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhoneFriendshipWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhoneBothWarning')
  })

  it('should show combined warning when both friendships and pending requests exist', async () => {
    mockCurrentUserHasAnyRelationship.mockReturnValue({ hasPending: true, hasFriendship: true })
    const wrapper = await mountAndOpenRemoveConfirm()
    expect(wrapper.text()).toContain('user.profile.removePhoneBothWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhonePendingWarning')
    expect(wrapper.text()).not.toContain('user.profile.removePhoneFriendshipWarning')
  })
})
