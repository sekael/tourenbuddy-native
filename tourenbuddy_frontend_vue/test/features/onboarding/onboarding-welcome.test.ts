import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OnboardingWelcome from '@/features/onboarding/presentation/components/onboarding-welcome.vue'

describe('onboardingWelcome', () => {
  it('emits start / skip / dismiss from their respective buttons', async () => {
    const w = mount(OnboardingWelcome)
    await w.find('.start-btn').trigger('click')
    await w.find('.skip-btn').trigger('click')
    await w.find('.dismiss-btn').trigger('click')
    expect(w.emitted('start')).toHaveLength(1)
    expect(w.emitted('skip')).toHaveLength(1)
    expect(w.emitted('dismiss')).toHaveLength(1)
  })
})
