import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PhoneVerificationNotice from '@/features/friendships/presentation/components/phone-verification-notice.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

function mountNotice() {
  return mount(PhoneVerificationNotice, { attachTo: document.body })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('phoneVerificationNotice (gating edges)', () => {
  it('confirm button starts disabled (checkbox required)', () => {
    mountNotice()
    const btn = document.querySelector('.base-button--primary') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('does not emit acknowledged while checkbox unchecked', async () => {
    const wrapper = mountNotice()
    ;(document.querySelector('.base-button--primary') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('acknowledged')).toBeFalsy()
  })

  it('emits acknowledged when checkbox checked then confirm clicked', async () => {
    const wrapper = mountNotice()
    const checkbox = document.querySelector('.checkbox') as HTMLInputElement
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await wrapper.vm.$nextTick()
    ;(document.querySelector('.base-button--primary') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('acknowledged')).toBeTruthy()
  })
})
