import { useImperativeHandle, useRef, type CSSProperties, type KeyboardEvent } from 'react';

import { classes } from '@/core/web/classes';
import { focusForKeyboard } from '@/core/web/keyboard-focus.web';

import styles from './map-speed-dial-menu.module.css';
import { SpeedDialItem } from './speed-dial-item.web';

const c = classes(styles);

export type SpeedDialMenuItem = {
  id: string;
  icon: string;
  label: string;
  badge?: number;
  /** Attention without a number (shown when there is no badge). */
  dot?: boolean;
  disabled?: boolean;
  tooltip?: string;
};

export type SpeedDialMenuHandle = { focusFirst: () => void };

/** The speed-dial menu: items unfold upwards; arrows, Home and End move between them. */
export function MapSpeedDialMenu({
  items,
  onSelect,
  ref,
}: {
  items: SpeedDialMenuItem[];
  onSelect: (id: string) => void;
  ref?: React.Ref<HTMLDivElement>;
  handle?: React.Ref<SpeedDialMenuHandle>;
}) {
  const menuEl = useRef<HTMLDivElement | null>(null);
  const buttons = () =>
    Array.from(menuEl.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const btns = buttons();
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
    const target = {
      ArrowDown: btns[(idx + 1) % btns.length],
      ArrowUp: btns[(idx - 1 + btns.length) % btns.length],
      Home: btns[0],
      End: btns[btns.length - 1],
    }[e.key];
    if (e.key in { ArrowDown: 1, ArrowUp: 1, Home: 1, End: 1 }) {
      e.preventDefault();
      target?.focus();
    }
  }

  return (
    <div
      id="speed-dial-menu"
      ref={(node) => {
        menuEl.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
        // Keyboard users get focus on the first item as the menu opens.
        if (node) requestAnimationFrame(() => focusForKeyboard(buttons()[0]));
      }}
      role="menu"
      className={c('menu')}
      style={{ '--n': items.length } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      {items.map((item, idx) => (
        <div
          key={item.id}
          className={c('item-slot')}
          style={{ '--i': idx, '--ri': items.length - 1 - idx } as CSSProperties}
        >
          <SpeedDialItem
            icon={item.icon}
            label={item.label}
            disabled={item.disabled}
            tooltip={item.tooltip}
            data-tour={`menu-${item.id}`}
            onSelect={() => onSelect(item.id)}
            badge={
              item.badge && item.badge > 0 ? (
                <span className={c('badge')}>{item.badge > 9 ? '9+' : item.badge}</span>
              ) : item.dot ? (
                <span className={c('dot')} data-testid="menu-dot" />
              ) : null
            }
          />
        </div>
      ))}
    </div>
  );
}

/** Imperative focus for the parent (the PWA's `focusFirst`), unused when focus follows mount. */
export function useSpeedDialMenuHandle(ref: React.Ref<SpeedDialMenuHandle>) {
  useImperativeHandle(ref, () => ({ focusFirst: () => {} }));
}
