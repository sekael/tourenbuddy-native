import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseIcon from '@/core/components/base-icon.vue'

describe('baseIcon', () => {
  it('should apply no size class when size is omitted (inherits global default)', () => {
    const wrapper = mount(BaseIcon, { props: { name: 'close' } })
    expect(wrapper.classes().some(c => c.startsWith('base-icon--'))).toBe(false)
  })

  it('should apply the requested size class', () => {
    const wrapper = mount(BaseIcon, { props: { name: 'close', size: 'xl' } })
    expect(wrapper.classes()).toContain('base-icon--xl')
  })

  it('should keep the glyph decorative via aria-hidden', () => {
    const wrapper = mount(BaseIcon, { props: { name: 'map' } })
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('should render nothing for an empty name (valid unselected state)', () => {
    const wrapper = mount(BaseIcon, { props: { name: '' } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('should render nothing for an unregistered name instead of crashing', () => {
    const wrapper = mount(BaseIcon, { props: { name: 'does_not_exist' } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })
})
