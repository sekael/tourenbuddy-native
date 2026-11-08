import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeedbackSheet from '@/core/components/feedback-sheet.vue'
import {
  BUG_REPORT_GITHUB_ISSUE_URL,
  FEEDBACK_EMAIL,
  FEEDBACK_GITHUB_ISSUE_URL,
} from '@/core/constants/feedback'

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ info: vi.fn() }),
}))

describe('feedbackSheet', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should open bug report URL and emit close when primary button clicked', async () => {
    const mockOpen = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const wrapper = mount(FeedbackSheet)

    await wrapper.find('.base-button--primary').trigger('click')

    expect(mockOpen).toHaveBeenCalledWith(BUG_REPORT_GITHUB_ISSUE_URL, '_blank')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('should open feedback URL and emit close when secondary button clicked', async () => {
    const mockOpen = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const wrapper = mount(FeedbackSheet)

    await wrapper.find('.base-button--text').trigger('click')

    expect(mockOpen).toHaveBeenCalledWith(FEEDBACK_GITHUB_ISSUE_URL, '_blank')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('should show snackbar and not emit close when window.open is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const wrapper = mount(FeedbackSheet)

    await wrapper.find('.base-button--primary').trigger('click')

    expect(wrapper.emitted('close')).toBeUndefined()
    const snackbarEl = wrapper.find('[role="alert"]')
    expect(snackbarEl.exists()).toBe(true)
    expect(snackbarEl.text()).toContain('core.feedback.sheet.errorOpening')
  })

  it('should render the email link using FEEDBACK_EMAIL from the constants module', () => {
    const wrapper = mount(FeedbackSheet)

    const emailLink = wrapper.find(`a[href="mailto:${FEEDBACK_EMAIL}"]`)
    expect(emailLink.exists()).toBe(true)
    expect(emailLink.text()).toBe(FEEDBACK_EMAIL)
  })

  it('should emit close when the BottomSheet close button is clicked', async () => {
    const wrapper = mount(FeedbackSheet)

    await wrapper.find('.base-icon-button').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
