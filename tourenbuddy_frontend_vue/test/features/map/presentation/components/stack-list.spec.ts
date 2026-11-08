import type { StackEntry } from '@/features/map/presentation/components/stack-list'
import { describe, expect, it, vi } from 'vitest'
import { createStackList, orderStack } from '@/features/map/presentation/components/stack-list'

// A Popup that mounts its content in the document and fires `close` on remove, like MapLibre's.
vi.mock('maplibre-gl', () => {
  class Popup {
    private el = document.createElement('div')
    private handlers: (() => void)[] = []
    setLngLat() { return this }
    setDOMContent(node: Node) {
      const close = document.createElement('button')
      close.className = 'maplibregl-popup-close-button'
      this.el.append(close, node)
      return this
    }

    addTo() {
      document.body.append(this.el)
      return this
    }

    getElement() { return this.el }
    on(_: string, fn: () => void) {
      this.handlers.push(fn)
      return this
    }

    remove() {
      this.el.remove()
      this.handlers.forEach(fn => fn())
    }
  }
  return { default: { Popup }, Popup }
})

function entry(id: string, plannedDate: string | null, completed = false): StackEntry {
  return { id, name: id, sub: '', colors: ['#DC2626'], completed, plannedDate, glyph: null }
}

describe('orderStack', () => {
  it('should put dated plans first (earliest first), then undated, then done', () => {
    const ordered = orderStack([
      entry('done', '2026-01-01', true),
      entry('undated', null),
      entry('late', '2027-09-20'),
      entry('early', '2027-03-01'),
    ])
    expect(ordered.map(e => e.id)).toEqual(['early', 'late', 'undated', 'done'])
  })
})

describe('createStackList', () => {
  const map = {} as import('maplibre-gl').Map

  it('should select the tapped row and close the list', () => {
    const list = createStackList(map, 'Close')
    const onSelect = vi.fn()
    list.open('stack-1', [8, 47], [entry('a', null), entry('b', '2027-01-01')], '2 tours', onSelect)

    const rows = [...document.querySelectorAll<HTMLButtonElement>('.stack-list__row')]
    expect(rows.map(r => r.textContent)).toEqual(['b', 'a'])
    rows[1]!.click()

    expect(onSelect).toHaveBeenCalledWith('a')
    expect(list.activeId()).toBeNull()
    expect(document.querySelector('.stack-list')).toBeNull()
  })

  it('should not let a row tap reach the map as a background tap', () => {
    const list = createStackList(map, 'Close')
    list.open('stack-1', [8, 47], [entry('a', null)], '1 tour', vi.fn())
    const background = vi.fn()
    document.body.addEventListener('click', background)
    document.querySelector<HTMLButtonElement>('.stack-list__row')!.click()
    document.body.removeEventListener('click', background)
    expect(background).not.toHaveBeenCalled()
  })

  it('should close on Escape and hand focus back to the opener', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const list = createStackList(map, 'Close')
    list.open('stack-1', [8, 47], [entry('a', null)], '1 tour', vi.fn())
    expect(document.activeElement?.className).toBe('stack-list__row')

    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(list.activeId()).toBeNull()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
