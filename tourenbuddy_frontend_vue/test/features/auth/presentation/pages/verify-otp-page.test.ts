import { AuthApiError } from '@supabase/supabase-js'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import VerifyOtpPage from '@/features/auth/presentation/pages/verify-otp-page.vue'

const mockVerifyOtp = vi.fn()
const mockSendEmailOtp = vi.fn()
const mockPush = vi.fn()

const mockAuthStore = reactive({
  verifyOtp: mockVerifyOtp,
  sendEmailOtp: mockSendEmailOtp,
  isAuthenticated: false,
})

vi.mock('@/features/auth/presentation/stores/auth-store', () => ({
  useAuthStore: vi.fn(() => mockAuthStore),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRoute: () => ({ query: { email: 'test@example.com' } }),
}))

describe('verifyOtpPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockAuthStore.isAuthenticated = false
    mockAuthStore.verifyOtp = mockVerifyOtp
    mockAuthStore.sendEmailOtp = mockSendEmailOtp
  })

  it('should render email in subtitle', () => {
    const wrapper = mount(VerifyOtpPage)
    expect(wrapper.text()).toContain('test@example.com')
  })

  it('should call verifyOtp with email and code on submit', async () => {
    mockVerifyOtp.mockResolvedValue(undefined)
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('input').setValue('123456')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith('test@example.com', '123456'),
    )
  })

  // Post-verify navigation is asserted against `setupAuthRedirect`
  // (test/app/router/router-guards.test.ts) — the page no longer owns a redirect watcher.
  it('should not navigate on its own when the session lands', async () => {
    mount(VerifyOtpPage)
    mockAuthStore.isAuthenticated = true
    await new Promise(r => setTimeout(r, 50))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should show error message and clear input when verifyOtp fails', async () => {
    mockVerifyOtp.mockRejectedValue(new Error('invalid token'))
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('input').setValue('000000')
    await wrapper.find('form').trigger('submit')
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('invalid token')
      expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    })
  })

  it('should strip non-digits from a pasted code and verify exactly once', async () => {
    mockVerifyOtp.mockResolvedValue(undefined)
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('input').setValue('123 456\n')
    await vi.waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith('test@example.com', '123456'),
    )
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1)
  })

  it('should truncate an over-long value to six digits', async () => {
    mockVerifyOtp.mockResolvedValue(undefined)
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('input').setValue('1234567890')
    await vi.waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith('test@example.com', '123456'),
    )
  })

  it('should not resubmit a rejected code after the field is cleared', async () => {
    mockVerifyOtp.mockRejectedValue(new Error('invalid token'))
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('input').setValue('000000')
    await vi.waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledTimes(1))
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 50))
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1)
  })

  it('should not verify while fewer than six digits are entered', async () => {
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('input').setValue('12345')
    await new Promise(r => setTimeout(r, 50))
    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(wrapper.find('.base-button--primary').attributes('disabled')).toBeDefined()
  })

  it('should not start a second verification while one is in flight', async () => {
    mockVerifyOtp.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('input').setValue('123456')
    await vi.waitFor(() => expect(mockVerifyOtp).toHaveBeenCalledTimes(1))
    await wrapper.find('form').trigger('submit')
    await new Promise(r => setTimeout(r, 50))
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1)
  })

  describe('resend', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const resendBtn = (w: ReturnType<typeof mount>) => w.find('.base-button--secondary')

    it('should hold resend for the cooldown since the code was just sent', async () => {
      const wrapper = mount(VerifyOtpPage)
      await resendBtn(wrapper).trigger('click')
      expect(mockSendEmailOtp).not.toHaveBeenCalled()
      expect(resendBtn(wrapper).attributes('disabled')).toBeDefined()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(resendBtn(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('should wait out the server interval on a 429 instead of failing', async () => {
      mockSendEmailOtp.mockRejectedValue(new AuthApiError(
        'For security purposes, you can only request this after 42 seconds.',
        429,
        'over_email_send_rate_limit',
      ))
      const wrapper = mount(VerifyOtpPage)
      await vi.advanceTimersByTimeAsync(60_000)
      await resendBtn(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.text()).not.toContain('auth.verifyOtp.resendError')
      expect(resendBtn(wrapper).attributes('disabled')).toBeDefined()
      await vi.advanceTimersByTimeAsync(42_000)
      expect(resendBtn(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('should show error message when resend fails otherwise', async () => {
      mockSendEmailOtp.mockRejectedValue(new Error('network error'))
      const wrapper = mount(VerifyOtpPage)
      await vi.advanceTimersByTimeAsync(60_000)
      await resendBtn(wrapper).trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('auth.verifyOtp.resendError')
    })
  })

  it('should navigate to home on back button click', async () => {
    const wrapper = mount(VerifyOtpPage)
    await wrapper.find('.back-btn').trigger('click')
    expect(mockPush).toHaveBeenCalledWith({ name: 'home' })
  })
})
