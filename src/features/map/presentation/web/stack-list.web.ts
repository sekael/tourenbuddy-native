// Ported from the PWA's features/map/presentation/components/stack-list.ts (port-pwa-web): MapLibre GL JS on the web.
import type { Map as MapLibreMap } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import { cssFill } from './pie-marker.web';

/** One tour of a same-spot stack, as its row shows it. */
export interface StackEntry {
  id: string;
  /** Marker colours (split when several). */
  colors: string[];
  name: string;
  /** Second line: date, "no date" or "done" — the label's sub line. */
  sub: string;
  completed: boolean;
  /** ISO start date; null = undated. */
  plannedDate: string | null;
  /** White SVG of the primary activity, drawn in the dot like on the marker; null = untyped. */
  glyph: string | null;
}

/** Planned with a date (earliest first), then undated, then done. */
export function orderStack<T extends Pick<StackEntry, 'completed' | 'plannedDate' | 'name'>>(
  entries: T[],
): T[] {
  const rank = (e: T) => (e.completed ? 2 : e.plannedDate ? 0 : 1);
  return [...entries].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '') ||
      a.name.localeCompare(b.name),
  );
}

export interface StackList {
  /**
   * Open below the stack, or upward with `above` (a sheet covers the screen below it). Returns the
   * popup's element to pan into view; none when that list is already open.
   */
  open: (
    stackId: string,
    at: [number, number],
    entries: StackEntry[],
    title: string,
    onSelect: (id: string) => void,
    above?: boolean,
  ) => HTMLElement | undefined;
  close: () => void;
  activeId: () => string | null;
}

/**
 * A popup listing the tours that share one spot — the map can't zoom them apart (design D7).
 * Opening focuses the first row; closing returns focus to whatever opened it.
 */
export function createStackList(map: MapLibreMap, closeLabel: string): StackList {
  let popup: maplibregl.Popup | null = null;
  let active: string | null = null;

  function close() {
    popup?.remove();
  }

  function open(
    stackId: string,
    at: [number, number],
    entries: StackEntry[],
    title: string,
    onSelect: (id: string) => void,
    above = false,
  ) {
    if (active === stackId) return undefined;
    close();
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const root = document.createElement('div');
    root.className = 'stack-list';
    const heading = document.createElement('h3');
    heading.className = 'stack-list__title';
    heading.textContent = title;
    const list = document.createElement('ul');
    list.className = 'stack-list__rows';
    list.setAttribute('aria-label', title);
    for (const entry of orderStack(entries)) {
      const item = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'stack-list__row';
      const dot = document.createElement('span');
      dot.className = 'stack-list__dot';
      dot.style.background = cssFill(entry.colors);
      if (entry.completed) dot.dataset.completed = '';
      if (entry.glyph) {
        const glyph = document.createElement('img');
        glyph.src = `data:image/svg+xml,${encodeURIComponent(entry.glyph)}`;
        glyph.alt = '';
        dot.append(glyph);
      }
      dot.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'stack-list__text';
      const name = document.createElement('span');
      name.className = 'stack-list__name';
      name.textContent = entry.name;
      const sub = document.createElement('span');
      sub.className = 'stack-list__sub';
      sub.textContent = entry.sub;
      text.append(name, sub);
      row.append(dot, text);
      row.addEventListener('click', (e) => {
        // The row must not also reach the map as a background tap (design D1).
        e.stopPropagation();
        close();
        onSelect(entry.id);
      });
      item.append(row);
      list.append(item);
    }
    root.append(heading, list);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });

    active = stackId;
    const current = new maplibregl.Popup({
      className: above ? 'stack-list-popup stack-list-popup--above' : 'stack-list-popup',
      // Fixed, so the list can't flip sides while the map pans it into view.
      anchor: above ? 'bottom' : 'top',
      closeButton: true,
      closeOnClick: true,
      closeOnMove: false,
      focusAfterOpen: false,
      maxWidth: '300px',
      offset: 24,
    })
      .setLngLat(at)
      .setDOMContent(root)
      .addTo(map);
    current
      .getElement()
      ?.querySelector('.maplibregl-popup-close-button')
      ?.setAttribute('aria-label', closeLabel);
    current.on('close', () => {
      if (popup !== current) return;
      popup = null;
      active = null;
      returnFocus?.focus();
    });
    popup = current;
    // Not scrolled into view by the browser: that would shift the map's container, not the map.
    list.querySelector('button')?.focus({ preventScroll: true });
    return current.getElement();
  }

  return { open, close, activeId: () => active };
}
