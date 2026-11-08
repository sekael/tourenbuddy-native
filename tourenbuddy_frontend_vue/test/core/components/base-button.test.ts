import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BaseButton from '@/core/components/base-button.vue'

// These tests define the contract for the BaseButton <script setup> gap.
describe('baseButton', () => {
  it('should default to the primary variant and md size', () => {
    const wrapper = mount(BaseButton)
    expect(wrapper.classes()).toContain('base-button--primary')
    expect(wrapper.classes()).toContain('base-button--md')
  })

  it('should fall back to primary when given an unknown variant', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'bogus' as never } })
    expect(wrapper.classes()).toContain('base-button--primary')
    expect(wrapper.classes()).not.toContain('base-button--bogus')
  })

  it('should fall back to md when given an unknown size', () => {
    const wrapper = mount(BaseButton, { props: { size: 'huge' as never } })
    expect(wrapper.classes()).toContain('base-button--md')
    expect(wrapper.classes()).not.toContain('base-button--huge')
  })

  it('should apply the borderless text variant when requested', () => {
    const wrapper = mount(BaseButton, { props: { variant: 'text' } })
    expect(wrapper.classes()).toContain('base-button--text')
  })

  it('should not fire a fallthrough click handler when disabled', async () => {
    const onClick = vi.fn()
    const wrapper = mount(BaseButton, { attrs: { disabled: true, onClick } })
    await wrapper.trigger('click')
    expect(onClick).not.toHaveBeenCalled()
  })
})
