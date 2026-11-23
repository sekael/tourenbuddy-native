import { useRef } from 'react';

import { useReactive } from './use-reactive.web';

/** Pointer this close to the scroll box's top or bottom edge scrolls the list. */
const EDGE_PX = 64;
const MAX_SCROLL_STEP_PX = 16;

/** The nearest ancestor that scrolls vertically and has something to scroll. */
function scrollParent(el: Element | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight)
      return node;
  }
  return null;
}

/**
 * The PWA's `use-handle-reorder`: reorder a list by a row's drag handle with Pointer Events, so a
 * mouse, a pen and a finger all work. Rows carry `data-reorder-index`; the handle
 * (`touch-action: none`) captures the pointer, the dragged row follows it (`offset`), and it lands
 * after every other row whose middle is above the pointer. Held near the edge of its scroll box,
 * the list scrolls. Arrow keys on a focused handle move one step. Only in 'use no memo' components.
 */
export function useHandleReorder(move: (from: number, to: number) => void) {
  const state = useReactive(() => ({
    from: null as number | null,
    over: null as number | null,
    /** Vertical px the dragged row has travelled, scrolling included. */
    offset: 0,
  }));
  const moveRef = useRef(move);
  moveRef.current = move;
  const m = useRef({
    startY: 0,
    pointerY: 0,
    scroller: null as HTMLElement | null,
    rows: [] as HTMLElement[],
    startScroll: 0,
    frame: 0,
  }).current;

  function reset() {
    cancelAnimationFrame(m.frame);
    m.scroller = null;
    m.rows = [];
    state.from = null;
    state.over = null;
    state.offset = 0;
  }

  /** Where the dragged row would land: after every other row whose middle is above the pointer. */
  const target = () =>
    m.rows.filter((row) => {
      const { top, height } = row.getBoundingClientRect();
      return Number(row.dataset.reorderIndex) !== state.from && top + height / 2 < m.pointerY;
    }).length;

  function follow() {
    state.offset = m.pointerY - m.startY + (m.scroller ? m.scroller.scrollTop - m.startScroll : 0);
    if (m.rows.length > 0) state.over = target();
  }

  /** Each frame while dragging: scroll when held near an edge (faster the closer), then follow. */
  function tick() {
    if (m.scroller) {
      const { top, bottom } = m.scroller.getBoundingClientRect();
      const depth =
        Math.max(top + EDGE_PX - m.pointerY, 0) - Math.max(m.pointerY - (bottom - EDGE_PX), 0);
      if (depth !== 0) {
        m.scroller.scrollTop -=
          Math.sign(depth) * Math.min(Math.abs(depth) / 4 + 2, MAX_SCROLL_STEP_PX);
        follow();
      }
    }
    m.frame = requestAnimationFrame(tick);
  }

  /** Listeners for the handle of row `index` in a list of `count` rows (spread them). */
  function handleProps(index: number, count: number) {
    return {
      onPointerDown(e: React.PointerEvent<Element>) {
        if (e.button !== 0) return;
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture?.(e.pointerId);
        m.pointerY = e.clientY;
        m.startY = e.clientY;
        const list = handle.closest('[data-reorder-index]')?.parentElement;
        m.rows = list
          ? [...list.children].filter(
              (el): el is HTMLElement => el instanceof HTMLElement && 'reorderIndex' in el.dataset,
            )
          : [];
        m.scroller = scrollParent(handle);
        m.startScroll = m.scroller?.scrollTop ?? 0;
        state.from = index;
        state.over = index;
        m.frame = requestAnimationFrame(tick);
      },
      onPointerMove(e: React.PointerEvent<Element>) {
        if (state.from === null) return;
        m.pointerY = e.clientY;
        follow();
      },
      onPointerUp() {
        const [f, t] = [state.from, state.over];
        reset();
        if (f !== null && t !== null && f !== t) moveRef.current(f, t);
      },
      onPointerCancel: reset,
      onKeyDown(e: React.KeyboardEvent<Element>) {
        const to = index + (({ ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[e.key] ?? 0);
        if (to === index || to < 0 || to >= count) return;
        e.preventDefault();
        moveRef.current(index, to);
      },
    };
  }

  return {
    get from() {
      return state.from;
    },
    get over() {
      return state.over;
    },
    get offset() {
      return state.offset;
    },
    handleProps,
  };
}
