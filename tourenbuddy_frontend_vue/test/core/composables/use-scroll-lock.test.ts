import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { useScrollLock } from '@/core/composables/use-scroll-lock'

const Holder = defineComponent({
  setup: () => {
    useScrollLock()
    return () => h('div')
  },
})

const isLocked = () => document.documentElement.classList.contains('scroll-locked')

afterEach(() => {
  document.documentElement.classList.remove('scroll-locked')
})

describe('useScrollLock', () => {
  // The refcount's real failure mode: a leaving holder releasing a lock a
  // staying holder still needs. Invisible on a device until #247 comes back.
  it('should keep the lock while a second holder is still mounted', () => {
    const first = mount(Holder)
    const second = mount(Holder)

    first.unmount()
    expect(isLocked()).toBe(true)

    second.unmount()
    expect(isLocked()).toBe(false)
  })
})
