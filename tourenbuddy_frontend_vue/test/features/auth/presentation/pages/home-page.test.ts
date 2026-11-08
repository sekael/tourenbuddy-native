import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { isOnline } from '@/core/offline/use-online-status'
import HomePage from '@/features/auth/presentation/pages/home-page.vue'

const mockSendEmailOtp = vi.fn()
const mockPush = vi.fn()

const mockAuthStore = reactive({ sendEmailOtp: mockSendEmailOtp })

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => mockAuthStore),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

describe('homePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockAuthStore.sendEmailOtp = mockSendEmailOtp
    isOnline.value = true
  })

  it('should refuse to request a code offline instead of leaking a raw fetch error', async () => {
    isOnline.value = false
    const wrapper = mount(HomePage)
    await wrapper.find('input').setValue('user@example.com')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('offline.actionUnavailable')
    expect(mockSendEmailOtp).not.toHaveBeenCalled()
  })

  it('should show validation error and not send code when email is invalid', async () => {
    const wrapper = mount(HomePage)
    await wrapper.find('input').setValue('not-an-email')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('auth.emailEntry.invalidEmail')
    expect(mockSendEmailOtp).not.toHaveBeenCalled()
  })

  it('should surface the error and stay put when sending the code fails', async () => {
    mockSendEmailOtp.mockRejectedValue(new Error('rate limited'))
    const wrapper = mount(HomePage)
    await wrapper.find('input').setValue('user@example.com')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('rate limited'))
    expect(mockPush).not.toHaveBeenCalled()
  })
})
