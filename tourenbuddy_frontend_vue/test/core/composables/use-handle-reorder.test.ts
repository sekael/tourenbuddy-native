import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHandleReorder } from '@/core/composables/use-handle-reorder'

/** A list of `count` 100 px rows (happy-dom has no layout); returns each row's handle. */
function list(count: number, parent: HTMLElement = document.body) {
  const ul = document.createElement('ul')
  const handles = Array.from({ length: count }, (_, i) => {
    const row = document.createElement('li')
    row.dataset.reorderIndex = String(i)
    row.getBoundingClientRect = () => ({ top: i * 100, height: 100 }) as DOMRect
    const handle = document.createElement('button')
    row.append(handle)
    ul.append(row)
    return handle
  })
  parent.append(ul)
  return handles
}

function pointer(init: Partial<PointerEvent> = {}) {
  return ({ button: 0, clientY: 0, pointerId: 1, preventDefault: vi.fn(), currentTarget: null, ...init }) as unknown as PointerEvent
}
const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as KeyboardEvent

function drag(handle: Element, index: number, count: number, fromY: number, ...ys: number[]) {
  const move = vi.fn()
  const reorder = useHandleReorder(move)
  const props = reorder.handleProps(index, count)
  props.onPointerdown(pointer({ currentTarget: handle, clientY: fromY }))
  for (const y of ys)
    props.onPointermove(pointer({ clientY: y }))
  return { move, reorder, props }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('useHandleReorder', () => {
  it('should land after every other row whose middle the pointer passed', () => {
    const handles = list(3)
    const { move, props, reorder } = drag(handles[0]!, 0, 3, 50, 160)
    expect(reorder.over.value).toBe(1)
    props.onPointerup()
    expect(move).toHaveBeenCalledWith(0, 1)
  })

  it('should mean last when dragged past the end, first when above the list', () => {
    const handles = list(3)
    const down = drag(handles[0]!, 0, 3, 50, 900)
    down.props.onPointerup()
    expect(down.move).toHaveBeenCalledWith(0, 2)
    const up = drag(handles[2]!, 2, 3, 250, -400)
    up.props.onPointerup()
    expect(up.move).toHaveBeenCalledWith(2, 0)
  })

  it('should not move when brought back to its own slot, or when cancelled', () => {
    const handles = list(3)
    const back = drag(handles[1]!, 1, 3, 150, 290, 140)
    back.props.onPointerup()
    expect(back.move).not.toHaveBeenCalled()
    const cancelled = drag(handles[0]!, 0, 3, 50, 290)
    cancelled.props.onPointercancel()
    cancelled.props.onPointerup()
    expect(cancelled.move).not.toHaveBeenCalled()
    expect(cancelled.reorder.from.value).toBeNull()
  })

  it('should ignore a secondary button', () => {
    const r = useHandleReorder(vi.fn())
    r.handleProps(0, 2).onPointerdown(pointer({ button: 2 }))
    expect(r.from.value).toBeNull()
  })

  it('should step with the arrow keys and stop at either end', () => {
    const move = vi.fn()
    const { handleProps } = useHandleReorder(move)
    handleProps(0, 3).onKeydown(key('ArrowUp'))
    handleProps(2, 3).onKeydown(key('ArrowDown'))
    handleProps(0, 3).onKeydown(key('Enter'))
    expect(move).not.toHaveBeenCalled()
    handleProps(1, 3).onKeydown(key('ArrowUp'))
    handleProps(1, 3).onKeydown(key('ArrowDown'))
    expect(move.mock.calls).toEqual([[1, 0], [1, 2]])
  })

  it('should scroll a list held near its bottom edge and keep the card under the pointer', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperties(scroller, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } })
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 300 }) as DOMRect
    document.body.append(scroller)
    const handles = list(3, scroller)

    const { reorder, props } = drag(handles[0]!, 0, 3, 50, 290)
    frames.shift()!(0)
    expect(scroller.scrollTop).toBeGreaterThan(0)
    expect(reorder.offset.value).toBe(240 + scroller.scrollTop)
    props.onPointercancel()
  })
})
