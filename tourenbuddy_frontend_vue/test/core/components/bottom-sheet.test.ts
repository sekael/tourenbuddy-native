import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import BottomSheet from '@/core/components/bottom-sheet.vue'
import { sheetInset } from '@/core/composables/use-sheet-inset'

// Sheets register in a shared inset registry — unmount each test's sheets.
enableAutoUnmount(afterEach)

// happy-dom stubs for APIs not supported in test env
beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true, configurable: true })
  // Default: no keyboard. Individual tests override with a scriptable viewport.
  Object.defineProperty(window, 'visualViewport', {
    value: undefined,
    writable: true,
    configurable: true,
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
})

function firePointer(el: Element, type: string, clientY: number, pointerId = 1, timeStamp?: number) {
  const event = new PointerEvent(type, { clientY, pointerId, bubbles: true, cancelable: true })
  if (timeStamp !== undefined)
    Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  el.dispatchEvent(event)
}

function sheetHeight(wrapper: { find: (s: string) => { attributes: (a: string) => string | undefined } }) {
  return Number((wrapper.find('.bottom-sheet').attributes('style') ?? '').match(/height: (\d+)px/)?.[1] ?? -1)
}

describe('bottomSheet', () => {
  it('should render the title when provided', () => {
    const wrapper = mount(BottomSheet, { props: { title: 'My Sheet' } })
    expect(wrapper.find('h2').text()).toBe('My Sheet')
  })

  it('should not render an h2 when no title is provided', () => {
    const wrapper = mount(BottomSheet, { props: { ariaLabel: 'Sheet' } })
    expect(wrapper.find('h2').exists()).toBe(false)
  })

  it('should render the default slot content', () => {
    const wrapper = mount(BottomSheet, {
      props: { title: 'Test' },
      slots: { default: '<p class="slot-content">Hello</p>' },
    })
    expect(wrapper.find('.slot-content').exists()).toBe(true)
    expect(wrapper.find('.slot-content').text()).toBe('Hello')
  })

  it('should emit close when the close button is clicked', async () => {
    const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
    await wrapper.find('[aria-label="core.drawer.close"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('should have role="dialog" and aria-modal="true"', () => {
    const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
    const sheet = wrapper.find('.bottom-sheet')
    expect(sheet.attributes('role')).toBe('dialog')
    expect(sheet.attributes('aria-modal')).toBe('true')
  })

  it('should link aria-labelledby to title when title is provided', () => {
    const wrapper = mount(BottomSheet, { props: { title: 'Labeled' } })
    const sheet = wrapper.find('.bottom-sheet')
    expect(sheet.attributes('aria-labelledby')).toBe('bottom-sheet-title')
    expect(wrapper.find('#bottom-sheet-title').exists()).toBe(true)
  })

  it('should use aria-label fallback when no title is provided', () => {
    const wrapper = mount(BottomSheet, { props: { ariaLabel: 'Custom label' } })
    const sheet = wrapper.find('.bottom-sheet')
    expect(sheet.attributes('aria-label')).toBe('Custom label')
    expect(sheet.attributes('aria-labelledby')).toBeUndefined()
  })

  it('should have the close button with an aria-label', () => {
    const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
    expect(wrapper.find('[aria-label="core.drawer.close"]').attributes('aria-label')).toBe('core.drawer.close')
  })

  describe('collapsed mode', () => {
    it('should hide close button, drag handle, and footer when collapsed', () => {
      const wrapper = mount(BottomSheet, {
        props: { title: 'Test', collapsed: true },
        slots: { footer: '<div class="slot-footer">f</div>' },
      })
      expect(wrapper.find('[aria-label="core.drawer.close"]').exists()).toBe(false)
      expect(wrapper.find('.drag-handle').exists()).toBe(false)
      expect(wrapper.find('.footer').attributes('style')).toContain('display: none')
    })

    it('should keep default slot mounted but hidden when collapsed', () => {
      const wrapper = mount(BottomSheet, {
        props: { title: 'Test', collapsed: true },
        slots: { default: '<p class="slot-content">Preserved</p>' },
      })
      expect(wrapper.find('.slot-content').exists()).toBe(true)
      expect(wrapper.find('.content').attributes('style')).toContain('display: none')
    })

    it('should preserve slot state across collapsed toggle', async () => {
      const wrapper = mount(BottomSheet, {
        props: { title: 'Test', collapsed: false },
        slots: { default: '<input class="slot-input" />' },
      })
      const input = wrapper.find('.slot-input').element as HTMLInputElement
      input.value = 'typed'
      await wrapper.setProps({ collapsed: true })
      // Same DOM node preserved → value retained
      const afterCollapse = wrapper.find('.slot-input').element as HTMLInputElement
      expect(afterCollapse).toBe(input)
      expect(afterCollapse.value).toBe('typed')
      await wrapper.setProps({ collapsed: false })
      expect((wrapper.find('.slot-input').element as HTMLInputElement).value).toBe('typed')
    })

    it('should hide back button when collapsed', () => {
      const wrapper = mount(BottomSheet, {
        props: { title: 'Test', collapsed: true, showBack: true },
      })
      expect(wrapper.find('[aria-label="core.drawer.back"]').exists()).toBe(false)
    })
  })

  describe('drag handle', () => {
    it('should render drag handle with correct a11y attributes', () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      const handle = wrapper.find('.drag-handle')
      expect(handle.exists()).toBe(true)
      expect(handle.attributes('role')).toBe('separator')
      expect(handle.attributes('aria-orientation')).toBe('horizontal')
      expect(handle.attributes('tabindex')).toBe('0')
      expect(handle.attributes('aria-valuemin')).toBe('0')
      expect(handle.attributes('aria-valuemax')).toBe('2')
    })

    it('should not render drag handle when collapsed', () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', collapsed: true } })
      expect(wrapper.find('.drag-handle').exists()).toBe(false)
    })

    it('should not start drag when collapsed prop is true', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', collapsed: true } })
      // collapsed → no handle → no drag possible; inline height style should be empty
      const style = wrapper.find('.bottom-sheet').attributes('style') ?? ''
      expect(style).not.toContain('height')
    })
  })

  describe('drag resize', () => {
    it('should set height to expanded snap on mount (natural height unmeasurable in test env)', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      // measured offsetHeight = 0 in happy-dom → fallback to expandedHeight = 700
      expect(wrapper.find('.bottom-sheet').attributes('style')).toContain('height: 700px')
    })

    it('should update height during drag', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      // Start drag at y=500 (sheet is at 700px)
      firePointer(handle, 'pointerdown', 500)
      // Move down 100px → newHeight = 700 - (600 - 500) = 600
      firePointer(handle, 'pointermove', 600)
      await nextTick()
      const style = wrapper.find('.bottom-sheet').attributes('style') ?? ''
      expect(style).toContain('height: 600px')
    })

    it('should resist past the expanded ceiling and settle back on release', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 500)
      // 400px up would be 1100px: past the 700px ceiling it only stretches a little.
      firePointer(handle, 'pointermove', 100)
      await nextTick()
      const h = sheetHeight(wrapper)
      expect(h).toBeGreaterThan(700)
      expect(h).toBeLessThan(748)
      firePointer(handle, 'pointerup', 100)
      await nextTick()
      expect(sheetHeight(wrapper)).toBe(700)
    })

    it('should drag from the header but not from its buttons', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const header = wrapper.find('.header').element
      const before = sheetHeight(wrapper)
      firePointer(wrapper.find('button').element, 'pointerdown', 500)
      firePointer(header, 'pointermove', 400)
      await nextTick()
      expect(sheetHeight(wrapper)).toBe(before)
      firePointer(wrapper.find('h2').element, 'pointerdown', 500)
      firePointer(header, 'pointermove', 400)
      await nextTick()
      expect(sheetHeight(wrapper)).toBeGreaterThan(before)
    })

    it('should clamp height to peek floor during drag', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 300)
      // Move down by 600px → would be 0 but clamped to peekHeight (~0 in test env)
      firePointer(handle, 'pointermove', 900)
      await nextTick()
      const styleAttr = wrapper.find('.bottom-sheet').attributes('style') ?? ''
      const heightMatch = styleAttr.match(/height: (\d+)px/)
      const h = heightMatch ? Number(heightMatch[1]) : 999
      expect(h).toBeLessThanOrEqual(400)
    })

    it('should snap to expanded when released after large upward drag', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 500)
      // Move up ~200px → currentHeight clamped at 700 → nearest snap = expanded
      firePointer(handle, 'pointermove', 300)
      firePointer(handle, 'pointerup', 300)
      await nextTick()
      expect(wrapper.find('.bottom-sheet').attributes('style')).toContain('height: 700px')
    })

    it('should keep current snap when tap (< 4px movement)', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 500)
      // Move only 2px — below threshold
      firePointer(handle, 'pointermove', 502)
      firePointer(handle, 'pointerup', 502)
      await nextTick()
      // Should remain at current snap (expanded = 700px in test env)
      expect(wrapper.find('.bottom-sheet').attributes('style')).toContain('height: 700px')
    })
  })

  describe('fit content', () => {
    // Captures the sheet's ResizeObserver so tests can report content size changes.
    let notify: () => void
    beforeEach(() => {
      vi.stubGlobal('ResizeObserver', class {
        constructor(cb: ResizeObserverCallback) {
          notify = () => cb([{ target: document.createElement('div') } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
        }

        observe() {}
        disconnect() {}
      })
    })

    async function mountWithContent(height: number) {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', fitContent: true } })
      const body = wrapper.find('.content-body').element
      const setContent = async (h: number) => {
        Object.defineProperty(body, 'offsetHeight', { value: h, configurable: true })
        notify()
        await flushPromises()
      }
      await setContent(height)
      return { wrapper, setContent }
    }

    it('should open long content at 70% and expand to its full height, capped at 90%', async () => {
      const { wrapper } = await mountWithContent(1200)
      expect(sheetHeight(wrapper)).toBe(700)
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'Home' })
      expect(sheetHeight(wrapper)).toBe(900)
    })

    it('should watch its footer and grow when a confirmation opens there', async () => {
      const observed: Element[] = []
      vi.stubGlobal('ResizeObserver', class {
        constructor(cb: ResizeObserverCallback) {
          notify = () => cb([{ target: document.createElement('div') } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
        }

        observe(el: Element) { observed.push(el) }
        unobserve() {}
        disconnect() {}
      })
      const wrapper = mount(BottomSheet, { props: { title: 'Test', fitContent: true }, slots: { footer: '<button>Delete</button>' } })
      const size = async (sel: string, h: number) => {
        Object.defineProperty(wrapper.find(sel).element, 'offsetHeight', { value: h, configurable: true })
        notify()
        await flushPromises()
      }
      await size('.content-body', 200)
      await size('.footer', 50)
      expect(sheetHeight(wrapper)).toBe(250)
      expect(observed).toContain(wrapper.find('.footer').element)
      await size('.footer', 300)
      expect(sheetHeight(wrapper)).toBe(500)
    })

    it('should show no drag handle when the content fits the opening height', async () => {
      const { wrapper } = await mountWithContent(300)
      expect(wrapper.find('.drag-handle').exists()).toBe(false)
      expect(sheetHeight(wrapper)).toBe(300)
    })

    it('should shrink with its content and drop the handle once it fits', async () => {
      const { wrapper, setContent } = await mountWithContent(1200)
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'Home' })
      await setContent(120)
      expect(sheetHeight(wrapper)).toBe(120)
      expect(wrapper.find('.drag-handle').exists()).toBe(false)
    })

    it('should not shrink while held, still grow, and refit once released', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', fitContent: true, resizable: true, holdHeight: true } })
      const body = wrapper.find('.content-body').element
      const setContent = async (h: number) => {
        Object.defineProperty(body, 'offsetHeight', { value: h, configurable: true })
        notify()
        await flushPromises()
      }
      await setContent(300)
      await setContent(100)
      expect(sheetHeight(wrapper)).toBe(300)
      await setContent(350)
      expect(sheetHeight(wrapper)).toBe(350)
      await setContent(1200)
      expect(sheetHeight(wrapper)).toBe(400)
      await setContent(100)
      await wrapper.setProps({ holdHeight: false })
      expect(sheetHeight(wrapper)).toBe(100)
    })

    it('should stay at peek when content changes after the user dragged it down', async () => {
      const { wrapper, setContent } = await mountWithContent(1200)
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'End' })
      const peek = sheetHeight(wrapper)
      await setContent(1300)
      expect(sheetHeight(wrapper)).toBe(peek)
    })

    it('should only rubber-band above the full content height', async () => {
      const { wrapper } = await mountWithContent(800)
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 500)
      firePointer(handle, 'pointermove', 0)
      await nextTick()
      expect(sheetHeight(wrapper)).toBeLessThan(848)
      firePointer(handle, 'pointerup', 0)
      await nextTick()
      expect(sheetHeight(wrapper)).toBe(800)
    })

    it('should keep a resizable sheet draggable even when its content fits', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', fitContent: true, resizable: true } })
      Object.defineProperty(wrapper.find('.content-body').element, 'offsetHeight', { value: 200, configurable: true })
      notify()
      await flushPromises()
      expect(wrapper.find('.drag-handle').exists()).toBe(true)
      expect(sheetHeight(wrapper)).toBe(200)
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'End' })
      expect(sheetHeight(wrapper)).toBeLessThan(200)
    })

    it('should let a held sheet be dragged to full snap heights however short its content', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', fitContent: true, resizable: true, holdHeight: true } })
      Object.defineProperty(wrapper.find('.content-body').element, 'offsetHeight', { value: 150, configurable: true })
      notify()
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 800)
      firePointer(handle, 'pointermove', 300)
      firePointer(handle, 'pointerup', 300)
      await nextTick()
      expect(sheetHeight(wrapper)).toBe(700)
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'ArrowDown' })
      expect(sheetHeight(wrapper)).toBe(400)
    })

    it('should open a long resizable sheet at 40% and cap its full height at 70%', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', fitContent: true, resizable: true } })
      Object.defineProperty(wrapper.find('.content-body').element, 'offsetHeight', { value: 1200, configurable: true })
      notify()
      await flushPromises()
      expect(sheetHeight(wrapper)).toBe(400)
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'Home' })
      expect(sheetHeight(wrapper)).toBe(700)
    })

    it('should count the header even while the sheet is still 0px tall', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test', fitContent: true } })
      for (const [sel, h] of [['.header', 56], ['.content-body', 100]] as const)
        Object.defineProperty(wrapper.find(sel).element, 'offsetHeight', { value: h, configurable: true })
      notify()
      await flushPromises()
      expect(sheetHeight(wrapper)).toBe(156)
    })
  })

  describe('flick and viewport', () => {
    it('should move one snap down on a fast short flick instead of returning to the nearest', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 500, 1, 0)
      // 30px in 10ms (3 px/ms): nearest snap is still expanded (700 vs 670)
      firePointer(handle, 'pointermove', 530, 1, 10)
      firePointer(handle, 'pointerup', 530, 1, 20)
      await nextTick()
      expect(sheetHeight(wrapper)).toBe(400)
    })

    it('should ignore a flick when the finger rested before lifting', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      const handle = wrapper.find('.drag-handle').element
      firePointer(handle, 'pointerdown', 500, 1, 0)
      firePointer(handle, 'pointermove', 530, 1, 10)
      firePointer(handle, 'pointerup', 530, 1, 500)
      await nextTick()
      expect(sheetHeight(wrapper)).toBe(700)
    })

    it('should recompute snap heights when the viewport changes (rotation)', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      window.innerHeight = 500
      window.dispatchEvent(new Event('resize'))
      await flushPromises()
      expect(sheetHeight(wrapper)).toBe(350)
    })

    it('should keep the inset of a sheet still open when a stacked sheet closes, then clear it', async () => {
      const inset = () => document.documentElement.style.getPropertyValue('--sheet-inset')
      const lower = mount(BottomSheet, { props: { title: 'Lower' } })
      const upper = mount(BottomSheet, { props: { title: 'Upper' } })
      await flushPromises()
      await lower.find('.drag-handle').trigger('keydown', { key: 'ArrowDown' })
      await upper.find('.drag-handle').trigger('keydown', { key: 'End' })
      expect(inset()).toBe(`${sheetHeight(lower)}px`)
      upper.unmount()
      expect(inset()).toBe(`${sheetHeight(lower)}px`)
      lower.unmount()
      expect(inset()).toBe('')
    })

    it('should publish the resting height at once, not the gliding one', async () => {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'End' })
      expect(sheetInset.value).toBe(sheetHeight(wrapper))
    })
  })

  describe('keyboard navigation', () => {
    async function mountAndGetHandle() {
      const wrapper = mount(BottomSheet, { props: { title: 'Test' } })
      await flushPromises()
      // starts at expanded (index 2) — natural height unmeasurable in happy-dom → fallback
      return wrapper
    }

    it('should stay at expanded on ArrowUp when already expanded', async () => {
      const wrapper = await mountAndGetHandle()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'ArrowUp' })
      await nextTick()
      expect(wrapper.find('.bottom-sheet').attributes('style')).toContain('height: 700px')
      expect(wrapper.find('.drag-handle').attributes('aria-valuenow')).toBe('2')
    })

    it('should go to default snap on ArrowDown from expanded', async () => {
      const wrapper = await mountAndGetHandle()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      expect(wrapper.find('.bottom-sheet').attributes('style')).toContain('height: 400px')
      expect(wrapper.find('.drag-handle').attributes('aria-valuenow')).toBe('1')
    })

    it('should cycle expanded → default → peek on repeated ArrowDown', async () => {
      const wrapper = await mountAndGetHandle()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      const style = wrapper.find('.bottom-sheet').attributes('style') ?? ''
      const h = Number(style.match(/height: (\d+)px/)?.[1] ?? -1)
      expect(h).toBeLessThan(400)
      expect(wrapper.find('.drag-handle').attributes('aria-valuenow')).toBe('0')
    })

    it('should not advance past expanded on ArrowUp', async () => {
      const wrapper = await mountAndGetHandle()
      expect(wrapper.find('.drag-handle').attributes('aria-valuenow')).toBe('2')
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'ArrowUp' })
      await nextTick()
      expect(wrapper.find('.drag-handle').attributes('aria-valuenow')).toBe('2')
    })

    it('should jump to expanded on Home key', async () => {
      const wrapper = await mountAndGetHandle()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'ArrowDown' })
      await nextTick()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'Home' })
      await nextTick()
      expect(wrapper.find('.bottom-sheet').attributes('style')).toContain('height: 700px')
    })

    it('should jump to peek on End key', async () => {
      const wrapper = await mountAndGetHandle()
      await wrapper.find('.drag-handle').trigger('keydown', { key: 'End' })
      await nextTick()
      const style = wrapper.find('.bottom-sheet').attributes('style') ?? ''
      const h = Number(style.match(/height: (\d+)px/)?.[1] ?? -1)
      expect(h).toBeLessThan(400)
      expect(wrapper.find('.drag-handle').attributes('aria-valuenow')).toBe('0')
    })
  })

  describe('scrolling content', () => {
    it('should not modify sheet height when content area receives scroll events', async () => {
      const wrapper = mount(BottomSheet, {
        props: { title: 'Test' },
        slots: { default: '<div style="height:2000px">tall content</div>' },
      })
      await flushPromises()
      const initialStyle = wrapper.find('.bottom-sheet').attributes('style')
      // Dispatch wheel/scroll on the content — should not affect height
      wrapper.find('.content').element.dispatchEvent(new Event('scroll', { bubbles: false }))
      await nextTick()
      expect(wrapper.find('.bottom-sheet').attributes('style')).toBe(initialStyle)
    })
  })
})
