import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OnboardingTourBanner from '@/features/onboarding/presentation/components/onboarding-tour-banner.vue'

describe('onboardingTourBanner', () => {
  function mountBanner(props: Record<string, unknown> = {}) {
    return mount(OnboardingTourBanner, {
      props: { title: 'Verify phone number', current: 2, total: 8, canBack: true, ...props },
    })
  }

  it('emits finish when the finish button is clicked', async () => {
    const w = mountBanner()
    await w.find('.finish-btn').trigger('click')
    expect(w.emitted('finish')).toHaveLength(1)
  })

  it('emits back and next from the arrow buttons', async () => {
    const w = mountBanner()
    const navBtns = w.findAll('.nav-btn')
    await navBtns[0].trigger('click')
    await navBtns[1].trigger('click')
    expect(w.emitted('back')).toHaveLength(1)
    expect(w.emitted('next')).toHaveLength(1)
  })

  it('disables back on the first step and does not emit', async () => {
    const w = mountBanner({ canBack: false })
    const backBtn = w.findAll('.nav-btn')[0]
    expect(backBtn.attributes('disabled')).toBeDefined()
    await backBtn.trigger('click')
    expect(w.emitted('back')).toBeUndefined()
  })

  it('renders progress as current / total', () => {
    const w = mountBanner({ current: 3, total: 8 })
    expect(w.text()).toContain('3 / 8')
  })

  it('renders the current step title', () => {
    const w = mountBanner({ title: 'Contacts list' })
    expect(w.find('.step-title').text()).toBe('Contacts list')
  })
})
