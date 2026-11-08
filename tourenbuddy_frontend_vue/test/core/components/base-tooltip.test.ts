import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BaseTooltip from '@/core/components/base-tooltip.vue'

function mockMatchMedia(hoverNone: boolean, desktop = true) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('hover') ? hoverNone : desktop,
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

function getBubble() {
  return document.querySelector('.tooltip-bubble') as HTMLElement | null
}

describe('baseTooltip', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
    document.querySelectorAll('.tooltip-bubble').forEach(el => el.remove())
  })

  describe('on hover device (desktop)', () => {
    beforeEach(() => mockMatchMedia(false))

    it('should not show bubble on touchstart', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('touchstart')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(false)
    })

    it('should show bubble on mouseenter', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('mouseenter')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(true)
    })

    it('should hide bubble on mouseleave', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('mouseenter')
      await wrapper.find('.tooltip-wrapper').trigger('mouseleave')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(false)
    })

    it('should hide bubble on click (activating the anchored control)', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('mouseenter')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(true)
      await wrapper.find('.tooltip-wrapper').trigger('click')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(false)
    })

    it('should render bubble with correct text', () => {
      mount(BaseTooltip, {
        props: { text: 'My tooltip' },
        slots: { default: '<span>x</span>' },
        attachTo: container,
      })
      expect(getBubble()?.textContent?.trim()).toBe('My tooltip')
    })
  })

  describe('on touch device in desktop view (tablet)', () => {
    beforeEach(() => mockMatchMedia(true))

    it('should show bubble on touchstart', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('touchstart')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(true)
    })

    it('should not show bubble on mouseenter', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('mouseenter')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(false)
    })

    it('should hide bubble on escape keydown', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('touchstart')
      await wrapper.find('.tooltip-wrapper').trigger('keydown', { key: 'Escape' })
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(false)
    })

    it('should NOT hide on click (tap-to-reveal survives the activating tap)', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('touchstart')
      await wrapper.find('.tooltip-wrapper').trigger('click')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(true)
    })

    it('should auto-dismiss after 3 seconds', async () => {
      vi.useFakeTimers()
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('touchstart')
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(true)
      vi.advanceTimersByTime(3000)
      await wrapper.vm.$nextTick()
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(false)
      vi.useRealTimers()
    })

    it('should reset dismiss timer on repeated touchstart', async () => {
      vi.useFakeTimers()
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      await wrapper.find('.tooltip-wrapper').trigger('touchstart')
      vi.advanceTimersByTime(2000)
      await wrapper.find('.tooltip-wrapper').trigger('touchstart')
      vi.advanceTimersByTime(2000)
      await wrapper.vm.$nextTick()
      expect(getBubble()?.classList.contains('tooltip-bubble--visible')).toBe(true)
      vi.useRealTimers()
    })
  })

  describe('in mobile view', () => {
    beforeEach(() => mockMatchMedia(true, false))

    it('should render no bubble and no aria-describedby, even on touchstart or mouseenter', async () => {
      const wrapper = mount(BaseTooltip, {
        props: { text: 'Hint' },
        slots: { default: '<span>icon</span>' },
        attachTo: container,
      })
      const anchor = wrapper.find('.tooltip-wrapper')
      await anchor.trigger('touchstart')
      await anchor.trigger('mouseenter')
      expect(getBubble()).toBeNull()
      expect(anchor.attributes('aria-describedby')).toBeUndefined()
    })
  })

  it('should have correct role and aria attributes', () => {
    mockMatchMedia(false)
    const wrapper = mount(BaseTooltip, {
      props: { text: 'Label' },
      slots: { default: '<span>x</span>' },
      attachTo: container,
    })
    const bubble = getBubble()
    expect(bubble?.getAttribute('role')).toBe('tooltip')
    const describedBy = wrapper.find('.tooltip-wrapper').attributes('aria-describedby')
    expect(describedBy).toBe(bubble?.getAttribute('id'))
  })
})
