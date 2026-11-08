import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { fadeOut, useExitAnimation } from '@/core/composables/use-exit-animation'

const Surface = defineComponent({
  setup() {
    const el = ref<HTMLElement | null>(null)
    useExitAnimation(el, fadeOut)
    return () => h('div', { ref: el, class: 'surface' })
  },
})

function mountToggle(attach: boolean) {
  const show = ref(true)
  const wrapper = mount(defineComponent({ setup: () => () => h('div', show.value ? [h(Surface)] : []) }), attach ? { attachTo: document.body } : {})
  return { show, wrapper }
}

describe('useExitAnimation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('should keep an owner-removed surface on screen, inert, until its exit finishes', async () => {
    let finish!: () => void
    const animate = vi.fn(() => ({ finished: new Promise<void>(r => (finish = r)) }))
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate']
    const { show } = mountToggle(true)
    show.value = false
    await nextTick()
    const ghost = document.querySelector<HTMLElement>('.surface')
    expect(ghost?.inert).toBe(true)
    expect(ghost?.hasAttribute('data-exiting')).toBe(true)
    expect(animate).toHaveBeenCalledOnce()
    finish()
    await vi.waitFor(() => expect(document.querySelector('.surface')).toBeNull())
  })

  it('should not resurrect a surface whose old parent is gone', async () => {
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate']
    const { wrapper } = mountToggle(false)
    wrapper.unmount()
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
  })
})
