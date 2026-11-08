import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import AdaptiveOverlay from '@/core/components/adaptive-overlay.vue'
import BottomSheet from '@/core/components/bottom-sheet.vue'
import DialogWindow from '@/core/components/dialog-window.vue'

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('adaptiveOverlay', () => {
  describe('on desktop (>=600px)', () => {
    beforeEach(() => {
      mockMatchMedia(true)
    })

    it('should render DialogWindow on desktop', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Settings' } })
      expect(wrapper.find('.dialog-card').exists()).toBe(true)
      expect(wrapper.find('.bottom-sheet').exists()).toBe(false)
    })

    it('should display the title in the dialog', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'My Title' } })
      expect(wrapper.find('h2').text()).toBe('My Title')
    })

    it('should render slot content inside the dialog', () => {
      const wrapper = mount(AdaptiveOverlay, {
        props: { title: 'Test' },
        slots: { default: '<p class="slot-content">Content</p>' },
      })
      expect(wrapper.find('.slot-content').exists()).toBe(true)
    })

    it('should emit close from the dialog close button on desktop', async () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Test' } })
      await wrapper.find('[aria-label="Close"]').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('should not forward fitContent to the desktop dialog', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Test', fitContent: true } })
      expect(wrapper.findComponent(DialogWindow).props()).not.toHaveProperty('fitContent')
    })

    it('should emit close when the dialog backdrop is clicked', async () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Test' } })
      await wrapper.find('.dialog-backdrop').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })
  })

  describe('on mobile (<600px)', () => {
    beforeEach(() => {
      mockMatchMedia(false)
    })

    it('should render BottomSheet on mobile', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Settings' } })
      expect(wrapper.find('.bottom-sheet').exists()).toBe(true)
      expect(wrapper.find('.dialog-card').exists()).toBe(false)
    })

    it('should display the title in the bottom sheet', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'My Title' } })
      expect(wrapper.find('h2').text()).toBe('My Title')
    })

    it('should render slot content inside the bottom sheet', () => {
      const wrapper = mount(AdaptiveOverlay, {
        props: { title: 'Test' },
        slots: { default: '<p class="slot-content">Content</p>' },
      })
      expect(wrapper.find('.slot-content').exists()).toBe(true)
    })

    it('should emit close from the bottom sheet close button on mobile', async () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Test' } })
      await wrapper.find('[aria-label="core.drawer.close"]').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('should default the mobile bottom sheet to fitContent', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Test' } })
      expect(wrapper.findComponent(BottomSheet).props('fitContent')).toBe(true)
    })

    it('should let a consumer opt back into snap with fit-content false', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Test', fitContent: false } })
      expect(wrapper.findComponent(BottomSheet).props('fitContent')).toBe(false)
    })

    it('should keep the close button rendered when not collapsed', () => {
      const wrapper = mount(AdaptiveOverlay, { props: { title: 'Test' } })
      expect(wrapper.find('.bottom-sheet [aria-label="core.drawer.close"]').exists()).toBe(true)
    })
  })
})

describe('adaptiveOverlay page collapse (#337)', () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  it('should keep slot state when a mobile page collapses and expands again', async () => {
    let mounts = 0
    const Stateful = defineComponent({
      setup() {
        mounts++
        const count = ref(0)
        return () => h('button', { class: 'stateful', onClick: () => count.value++ }, String(count.value))
      },
    })
    const wrapper = mount(AdaptiveOverlay, {
      props: { title: 'Test', page: true },
      slots: { default: () => h(Stateful) },
      attachTo: document.body,
    })
    await document.querySelector<HTMLElement>('.stateful')!.click()
    await wrapper.setProps({ collapsed: true })
    await wrapper.setProps({ collapsed: false })

    expect(mounts).toBe(1)
    expect(document.querySelector('.stateful')!.textContent).toBe('1')
    wrapper.unmount()
  })

  it('should hide the close control and page action while collapsed', () => {
    const wrapper = mount(AdaptiveOverlay, {
      props: { title: 'Test', page: true, collapsed: true },
      slots: { 'page-action': '<button class="save">Save</button>' },
      attachTo: document.body,
    })
    expect(document.querySelector('.full-screen-page--collapsed')).not.toBeNull()
    expect(document.querySelector('.full-screen-page [aria-label="core.drawer.close"]')).toBeNull()
    expect(document.querySelector('.full-screen-page .save')).toBeNull()
    wrapper.unmount()
  })
})
