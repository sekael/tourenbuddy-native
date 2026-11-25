import './base-tooltip.global.css';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './base-tooltip.module.css';
import { classes } from './classes';
import { useIsDesktop, useIsTouch } from './use-media-query.web';

const c = classes(styles);
const OFFSET = 8;
const EDGE_PADDING = 8;

/**
 * The PWA's tooltip: desktop only (on phones the content renders bare), above the control or below
 * it near the top edge, clamped to the viewport. Touch: tap to reveal, gone after 3 s.
 */
export function BaseTooltip({
  text,
  disabled,
  children,
}: {
  text: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const isTouch = useIsTouch();
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: '0px', left: '0px', transform: 'translate(-50%, -100%)' });
  const wrapper = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = `tooltip-${useId().replace(/:/g, '')}`;

  function computePosition() {
    if (!wrapper.current) return;
    const rect = wrapper.current.getBoundingClientRect();
    const width = bubble.current?.offsetWidth ?? 0;
    const x = Math.max(
      EDGE_PADDING + width / 2,
      Math.min(rect.left + rect.width / 2, window.innerWidth - EDGE_PADDING - width / 2),
    );
    setPos(
      rect.top < 48
        ? { top: `${rect.bottom + OFFSET}px`, left: `${x}px`, transform: 'translate(-50%, 0)' }
        : { top: `${rect.top - OFFSET}px`, left: `${x}px`, transform: 'translate(-50%, -100%)' },
    );
  }
  function show() {
    if (disabled || !isDesktop) return;
    computePosition();
    setVisible(true);
  }
  function hide() {
    setVisible(false);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }
  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );

  return (
    <>
      <span
        ref={wrapper}
        className={c('tooltip-wrapper')}
        aria-describedby={isDesktop ? id : undefined}
        onMouseEnter={() => !isTouch && show()}
        onMouseLeave={() => !isTouch && hide()}
        // The activating click hides it: a control that swaps in place may never fire mouseleave.
        onClick={() => !isTouch && hide()}
        onTouchStart={() => {
          if (!isTouch) return;
          show();
          if (dismissTimer.current) clearTimeout(dismissTimer.current);
          dismissTimer.current = setTimeout(hide, 3000);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          // Spent on the tooltip: the drawer around it stays open.
          if (visible) e.preventDefault();
          hide();
        }}
      >
        {children}
      </span>
      {isDesktop &&
        createPortal(
          <span
            id={id}
            ref={bubble}
            className={['tooltip-bubble', visible && 'tooltip-bubble--visible']
              .filter(Boolean)
              .join(' ')}
            style={pos}
            role="tooltip"
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
