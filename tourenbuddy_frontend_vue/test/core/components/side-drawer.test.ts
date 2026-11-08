import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SideDrawer from '@/core/components/side-drawer.vue'

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

describe('sideDrawer', () => {
  describe('on desktop (>=600px)', () => {
    beforeEach(() => {
      mockMatchMedia(true)
    })

    it('should render the drawer panel with title', () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Tour Details' } })
      expect(wrapper.find('.side-drawer').exists()).toBe(true)
      expect(wrapper.find('h2').text()).toBe('Tour Details')
    })

    it('should render a close button', () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Test' } })
      expect(wrapper.find('[aria-label="core.drawer.close"]').exists()).toBe(true)
      expect(wrapper.find('[aria-label="core.drawer.close"]').attributes('aria-label')).toBe('core.drawer.close')
    })

    it('should emit close when the close button is clicked', async () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Test' } })
      await wrapper.find('[aria-label="core.drawer.close"]').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('should render slot content', () => {
      const wrapper = mount(SideDrawer, {
        props: { title: 'Test' },
        slots: { default: '<p class="slot-content">Tour info here</p>' },
      })
      expect(wrapper.find('.slot-content').exists()).toBe(true)
      expect(wrapper.find('.slot-content').text()).toBe('Tour info here')
    })

    it('should not render a BottomSheet on desktop', () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Test' } })
      expect(wrapper.find('.bottom-sheet').exists()).toBe(false)
      expect(wrapper.find('.side-drawer').exists()).toBe(true)
    })

    it('should have role="dialog" and aria-modal="true"', () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Test' } })
      const drawer = wrapper.find('.side-drawer')
      expect(drawer.attributes('role')).toBe('dialog')
      expect(drawer.attributes('aria-modal')).toBe('true')
    })

    describe('collapsed mode', () => {
      it('should hide close button, slot content, and footer when collapsed', () => {
        const wrapper = mount(SideDrawer, {
          props: { title: 'Test', collapsed: true },
          slots: {
            default: '<p class="slot-content">hidden</p>',
            footer: '<div class="slot-footer">f</div>',
          },
        })
        expect(wrapper.find('[aria-label="core.drawer.close"]').exists()).toBe(false)
        expect(wrapper.find('.drawer-content').attributes('inert')).toBeDefined()
        expect(wrapper.find('.drawer-footer').attributes('inert')).toBeDefined()
        expect(wrapper.find('.side-drawer--collapsed').exists()).toBe(true)
      })

      it('should still render title when collapsed', () => {
        const wrapper = mount(SideDrawer, {
          props: { title: 'Edit: Rigi', collapsed: true },
        })
        expect(wrapper.find('h2').text()).toBe('Edit: Rigi')
      })

      it('should preserve slot state across collapsed toggle', async () => {
        const wrapper = mount(SideDrawer, {
          props: { title: 'Test', collapsed: false },
          slots: { default: '<input class="slot-input" />' },
        })
        const input = wrapper.find('.slot-input').element as HTMLInputElement
        input.value = 'typed'
        await wrapper.setProps({ collapsed: true })
        await wrapper.setProps({ collapsed: false })
        expect((wrapper.find('.slot-input').element as HTMLInputElement).value).toBe('typed')
      })

      it('should hide back button when collapsed', () => {
        const wrapper = mount(SideDrawer, {
          props: { title: 'Test', backLabel: 'Tours', collapsed: true },
        })
        expect(wrapper.find('[aria-label^="core.drawer.back"]').exists()).toBe(false)
      })
    })

    describe('escape', () => {
      const press = (target: EventTarget = document.body, init: KeyboardEventInit = {}) => {
        const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init })
        target.dispatchEvent(e)
        return e
      }

      it('should close on Escape wherever focus is, like the close button', () => {
        const wrapper = mount(SideDrawer, { props: { title: 'Test' }, attachTo: document.body })
        press()
        expect(wrapper.emitted('close')).toHaveLength(1)
        wrapper.unmount()
      })

      it('should leave Escape to a field being typed in', () => {
        const wrapper = mount(SideDrawer, {
          props: { title: 'Test' },
          slots: { default: '<input class="field">' },
          attachTo: document.body,
        })
        press(wrapper.find('.field').element)
        expect(wrapper.emitted('close')).toBeUndefined()
        wrapper.unmount()
      })

      it('should stay open when a control inside already spent the key', () => {
        const wrapper = mount(SideDrawer, {
          props: { title: 'Test' },
          slots: { default: '<button class="inner">x</button>' },
          attachTo: document.body,
        })
        const inner = wrapper.find('.inner').element
        inner.addEventListener('keydown', e => e.preventDefault())
        press(inner)
        expect(wrapper.emitted('close')).toBeUndefined()
        wrapper.unmount()
      })

      it('should stay open under a dialog stacked above it', () => {
        const wrapper = mount(SideDrawer, { props: { title: 'Test' }, attachTo: document.body })
        const dialog = document.createElement('div')
        dialog.setAttribute('aria-modal', 'true')
        document.body.append(dialog)
        press()
        expect(wrapper.emitted('close')).toBeUndefined()
        dialog.remove()
        wrapper.unmount()
      })

      it('should not close while collapsed (it has no close button then)', () => {
        const wrapper = mount(SideDrawer, { props: { title: 'Test', collapsed: true }, attachTo: document.body })
        press()
        expect(wrapper.emitted('close')).toBeUndefined()
        wrapper.unmount()
      })
    })
  })

  describe('on mobile (<600px)', () => {
    beforeEach(() => {
      mockMatchMedia(false)
    })

    it('should render a BottomSheet on mobile', () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Test' } })
      expect(wrapper.find('.bottom-sheet').exists()).toBe(true)
      expect(wrapper.find('.side-drawer').exists()).toBe(false)
    })

    it('should pass title to the BottomSheet on mobile', () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Mobile Tour' } })
      expect(wrapper.find('h2').text()).toBe('Mobile Tour')
    })

    it('should emit close from the BottomSheet close button on mobile', async () => {
      const wrapper = mount(SideDrawer, { props: { title: 'Test' } })
      await wrapper.find('[aria-label="core.drawer.close"]').trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    })
  })
})
