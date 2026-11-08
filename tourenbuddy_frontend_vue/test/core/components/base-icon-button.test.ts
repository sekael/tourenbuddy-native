import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import BaseIconButton from '@/core/components/base-icon-button.vue'

describe('baseIconButton', () => {
  it('should expose the label to assistive tech via aria-label and title', () => {
    const wrapper = mount(BaseIconButton, { props: { name: 'close', label: 'Close' } })
    expect(wrapper.attributes('aria-label')).toBe('Close')
    expect(wrapper.attributes('title')).toBe('Close')
  })

  it('should default to the round shape', () => {
    const wrapper = mount(BaseIconButton, { props: { name: 'close', label: 'Close' } })
    expect(wrapper.classes()).toContain('base-icon-button--round')
  })

  it('should apply the square shape class when requested', () => {
    const wrapper = mount(BaseIconButton, { props: { name: 'close', label: 'Close', shape: 'square' } })
    expect(wrapper.classes()).toContain('base-icon-button--square')
  })

  it('should not fire a fallthrough click handler when disabled', async () => {
    const onClick = vi.fn()
    const wrapper = mount(BaseIconButton, {
      props: { name: 'close', label: 'Close' },
      attrs: { disabled: true, onClick },
    })
    await wrapper.trigger('click')
    expect(onClick).not.toHaveBeenCalled()
  })
})
