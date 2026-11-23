import { useEffect, useLayoutEffect, useRef, type PointerEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIconButton } from './base-icon-button.web';
import styles from './bottom-sheet.module.css';
import { classes } from './classes';
import type { OverlayProps } from './dialog-window.web';
import { fadeOut, useExitAnimation } from './use-exit-animation.web';
import { useWindowHeight } from './use-media-query.web';
import { useReactive } from './use-reactive.web';
import { useSheetInset } from './use-sheet-inset.web';

const c = classes(styles);

type Snap = 'peek' | 'default' | 'expanded';
const SNAP_ORDER: Snap[] = ['peek', 'default', 'expanded'];
/** px/ms: a release faster than this moves one snap in the flick direction. */
const FLICK_VELOCITY = 0.5;
/** Rubber-band past the top snap: the sheet follows the finger with growing resistance. */
const OVERSTRETCH = 48;
const resist = (px: number) => OVERSTRETCH * (1 - 1 / (1 + px / OVERSTRETCH));

export type BottomSheetProps = OverlayProps & {
  /**
   * Sized by the content, gliding whenever it changes, the mobile twin of `DialogWindow`. Opens at
   * the content height (capped at 70 % of the viewport); only content that needs more gets a drag
   * handle, to expand up to the full content (capped at 90 %) or drop to peek.
   */
  fitContent?: boolean;
  /** With `fitContent`: always draggable; snaps to peek, 40 % and 70 % (browse surfaces). */
  resizable?: boolean;
  /** With `fitContent`: never shrink to shorter content while set; refits once released. */
  holdHeight?: boolean;
};

/**
 * The PWA's mobile bottom sheet (`bottom-sheet.vue` there), ported line by line: snap points, fit
 * to content, drag with flick and rubber band, keyboard snaps on the handle, `--sheet-inset`.
 */
export function BottomSheet(props: BottomSheetProps) {
  'use no memo';
  const { title, ariaLabel, collapsed, showBack, fitContent, resizable, holdHeight } = props;
  const { t } = useTranslation('web');
  const viewportHeight = useWindowHeight();

  const s = useReactive(() => ({
    peekHeight: 64,
    /** Natural height (chrome + content), uncapped; 0 until measured. */
    naturalHeight: 0,
    /** The handle's share of `naturalHeight` (0 while it is not rendered). */
    handleShare: 0,
    currentHeight: 0,
    isDragging: false,
    // Height changes glide, except the very first size (the sheet is still sliding in).
    glide: false,
    lastSnap: (fitContent ? 'default' : 'expanded') as Snap,
  }));
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    startY: 0,
    startHeight: 0,
    prevMove: { y: 0, t: 0 },
    lastMove: { y: 0, t: 0 },
    pointerId: null as number | null,
    captureEl: null as HTMLElement | null,
  }).current;

  const defaultHeight = Math.round(viewportHeight * 0.4);
  const expandedHeight = Math.round(viewportHeight * 0.7);
  /** Fit-content ceiling: room above stays for the status bar and a glimpse of the page. */
  const fullHeight = Math.round(viewportHeight * 0.9);

  // A fit-content sheet is only resizable when its content does not fit at the opening height,
  // decided without the handle's own height so showing it can never flip the decision back.
  const isDraggable = () =>
    !fitContent ||
    !!resizable ||
    s.naturalHeight === 0 ||
    s.naturalHeight - s.handleShare > expandedHeight;
  const draggable = isDraggable();
  const snaps = (): Snap[] => (isDraggable() ? SNAP_ORDER : ['default']);

  // Unmeasurable natural height (not laid out yet): the opening cap.
  function snapHeightPx(snap: Snap, natural = s.naturalHeight || expandedHeight): number {
    if (snap === 'peek') return s.peekHeight;
    if (!fitContent) return snap === 'expanded' ? expandedHeight : defaultHeight;
    const [opening, full] = resizable
      ? [defaultHeight, expandedHeight]
      : [expandedHeight, fullHeight];
    return Math.min(natural, snap === 'expanded' ? full : opening);
  }

  function updatePeekHeight() {
    s.peekHeight = (headerRef.current?.offsetHeight ?? 56) + (handleRef.current?.offsetHeight ?? 8);
  }

  function applySnap(snap: Snap) {
    s.lastSnap = snap;
    s.currentHeight = snapHeightPx(snap);
  }

  /** Where a drag or snap key may take the sheet: uncapped by content while held. */
  const userSnapPx = (snap: Snap) =>
    holdHeight ? snapHeightPx(snap, Infinity) : snapHeightPx(snap);

  /** A snap the user asked for (drag, snap key). */
  function moveTo(snap: Snap) {
    s.lastSnap = snap;
    s.currentHeight = userSnapPx(snap);
  }

  // Everything that is not the scroll box (handle, header, footer, padding) plus what the content
  // needs, summed per element: at the first fit the sheet is still 0 px tall.
  function measureNaturalHeight() {
    const sheet = sheetRef.current;
    const content = contentRef.current;
    if (!sheet || !content) return 0;
    const px = (v: string) => Number.parseFloat(v) || 0;
    const sheetStyle = getComputedStyle(sheet);
    const contentStyle = getComputedStyle(content);
    let natural =
      px(sheetStyle.paddingTop) +
      px(sheetStyle.paddingBottom) +
      px(contentStyle.marginTop) +
      px(contentStyle.paddingTop) +
      px(contentStyle.paddingBottom) +
      (bodyRef.current?.offsetHeight ?? 0);
    for (const child of sheet.children)
      if (child !== content) natural += (child as HTMLElement).offsetHeight;
    s.handleShare = handleRef.current?.offsetHeight ?? 0;
    return Math.max(0, Math.ceil(natural));
  }

  function nearestSnap(heightPx: number, bias: 'up' | 'down'): Snap {
    let best: Snap = snaps()[0]!;
    let bestDist = Infinity;
    for (const snap of snaps()) {
      const dist = Math.abs(userSnapPx(snap) - heightPx);
      if (dist < bestDist) {
        bestDist = dist;
        best = snap;
      } else if (dist === bestDist) {
        const idx = SNAP_ORDER.indexOf(snap);
        const bestIdx = SNAP_ORDER.indexOf(best);
        if (bias === 'up' && idx > bestIdx) best = snap;
        if (bias === 'down' && idx < bestIdx) best = snap;
      }
    }
    return best;
  }

  /** The first snap beyond `heightPx` in the flick direction (or the last one). */
  function nextSnap(heightPx: number, direction: 'up' | 'down'): Snap {
    const ordered = direction === 'up' ? snaps() : [...snaps()].reverse();
    return (
      ordered.find((snap) =>
        direction === 'up' ? userSnapPx(snap) > heightPx : userSnapPx(snap) < heightPx,
      ) ?? ordered.at(-1)!
    );
  }

  /** Re-fit to the content. Leaves a sheet the user dragged to peek alone. */
  function refit() {
    if (collapsed || s.isDragging) return;
    const held = s.naturalHeight ? s.currentHeight : 0;
    s.naturalHeight = measureNaturalHeight();
    if (fitContent) {
      applySnap(snaps().includes(s.lastSnap) ? s.lastSnap : 'default');
      if (holdHeight && s.lastSnap !== 'peek')
        s.currentHeight = Math.min(
          Math.max(held, s.currentHeight),
          snapHeightPx(s.lastSnap, Infinity),
        );
      return;
    }
    if (s.lastSnap === 'peek') return;
    // Non-fit sheets open at their natural height (capped), then snap normally.
    const opening = Math.min(s.naturalHeight || expandedHeight, expandedHeight);
    s.currentHeight = opening;
    s.lastSnap = nearestSnap(opening, 'up');
  }

  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    // Inert while collapsed or with nothing to resize. The header drags too, except its buttons.
    if (collapsed || !isDraggable() || (e.target as Element).closest('button, a, input')) return;
    e.preventDefault();
    s.isDragging = true;
    drag.startY = e.clientY;
    drag.startHeight = s.currentHeight;
    drag.prevMove = drag.lastMove = { y: e.clientY, t: e.timeStamp };
    drag.pointerId = e.pointerId;
    drag.captureEl = e.currentTarget;
    drag.captureEl.setPointerCapture(e.pointerId);
  }

  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    if (!s.isDragging) return;
    e.preventDefault();
    const ceiling = userSnapPx('expanded');
    const wanted = drag.startHeight - (e.clientY - drag.startY);
    s.currentHeight = Math.round(
      wanted > ceiling ? ceiling + resist(wanted - ceiling) : Math.max(s.peekHeight, wanted),
    );
    drag.prevMove = drag.lastMove;
    drag.lastMove = { y: e.clientY, t: e.timeStamp };
  }

  function onDragEnd(e: PointerEvent<HTMLDivElement>) {
    if (!s.isDragging) return;
    s.isDragging = false;
    drag.pointerId = null;
    if (Math.abs(e.clientY - drag.startY) < 4) {
      s.currentHeight = drag.startHeight; // a tap: the height stays
      return;
    }
    // Velocity of the last movement; stale if the finger rested before lifting.
    const dt = drag.lastMove.t - drag.prevMove.t;
    const velocity =
      dt > 0 && e.timeStamp - drag.lastMove.t < 100 ? (drag.lastMove.y - drag.prevMove.y) / dt : 0;
    const direction = drag.lastMove.y < drag.startY ? 'up' : 'down';
    moveTo(
      Math.abs(velocity) > FLICK_VELOCITY
        ? nextSnap(s.currentHeight, velocity < 0 ? 'up' : 'down')
        : nearestSnap(s.currentHeight, direction),
    );
  }

  function cancelDrag() {
    if (!s.isDragging) return;
    s.isDragging = false;
    if (drag.pointerId !== null && drag.captureEl) {
      try {
        drag.captureEl.releasePointerCapture(drag.pointerId);
      } catch {
        // pointer may already be released
      }
      drag.pointerId = null;
    }
    applySnap(s.lastSnap);
  }

  function onHandleKeydown(e: KeyboardEvent<HTMLDivElement>) {
    const list = snaps();
    const idx = list.indexOf(s.lastSnap);
    const target = (
      {
        ArrowUp: list[Math.min(idx + 1, list.length - 1)],
        ArrowDown: list[Math.max(idx - 1, 0)],
        Home: 'expanded',
        End: 'peek',
      } as Record<string, Snap | undefined>
    )[e.key];
    if (!target) return;
    e.preventDefault();
    moveTo(target);
  }

  // Watchers, as in the PWA: hold released → refit; handle shown or hidden → peek includes it.
  const first = useRef(true);
  useEffect(() => {
    if (!holdHeight && !first.current) refit();
  }, [holdHeight]);
  useLayoutEffect(() => {
    if (!first.current) updatePeekHeight();
  }, [draggable]);
  useEffect(() => {
    if (first.current) return;
    if (collapsed) cancelDrag();
    else {
      s.lastSnap = fitContent ? 'default' : 'expanded';
      requestAnimationFrame(refit);
    }
  }, [collapsed]);
  useEffect(() => {
    if (first.current) return;
    updatePeekHeight();
    if (fitContent || s.lastSnap === 'peek') refit();
    else applySnap(s.lastSnap);
  }, [viewportHeight]);

  // The map area the sheet covers, for toasts (`--sheet-inset`) and camera framing: the resting
  // height, not the gliding one, since a camera move starts before the glide ends.
  const publishInset = useSheetInset();
  useEffect(() => {
    if (!collapsed) publishInset(s.currentHeight);
  }, [s.currentHeight]);

  // Header and handle → peek height; body and footer → content changed; the sheet → its on-screen
  // height for `--sheet-inset` while collapsed.
  const latest = useRef({ refit, updatePeekHeight, collapsed, fitContent });
  latest.current = { refit, updatePeekHeight, collapsed, fitContent };
  const observer = useRef<ResizeObserver | null>(null);
  useLayoutEffect(() => {
    updatePeekHeight();
    observer.current = new ResizeObserver((entries) => {
      const l = latest.current;
      if (entries.some((entry) => entry.target !== sheetRef.current)) {
        l.updatePeekHeight();
        if (l.fitContent) l.refit();
      }
      if (sheetRef.current && l.collapsed) publishInset(sheetRef.current.offsetHeight);
    });
    for (const el of [headerRef.current, handleRef.current, bodyRef.current, sheetRef.current])
      if (el) observer.current.observe(el);
    if (!collapsed) refit();
    first.current = false;
    let frame = requestAnimationFrame(
      () => (frame = requestAnimationFrame(() => (s.glide = true))),
    );
    return () => {
      cancelAnimationFrame(frame);
      observer.current?.disconnect();
    };
  }, []);

  // The footer and the handle come and go.
  const hasFooter = !!props.footer;
  useLayoutEffect(() => {
    const els = [footerRef.current, handleRef.current].filter(Boolean) as HTMLElement[];
    els.forEach((el) => observer.current?.observe(el));
    return () => els.forEach((el) => observer.current?.unobserve(el));
  }, [hasFooter, draggable, collapsed]);

  // Swapped out by its owner (for a full-screen page): fade instead of vanishing.
  useExitAnimation(sheetRef, fadeOut);

  const titleId = 'bottom-sheet-title';
  const list = snaps();
  return (
    <div
      ref={(node) => {
        sheetRef.current = node;
        if (typeof props.ref === 'function') props.ref(node);
        else if (props.ref) props.ref.current = node;
      }}
      className={c('bottom-sheet', {
        'bottom-sheet--collapsed': collapsed,
        'bottom-sheet--still': s.isDragging || !s.glide,
        'bottom-sheet--static': !draggable,
      })}
      style={collapsed ? undefined : { height: `${s.currentHeight}px` }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? (ariaLabel ?? t('core.drawer.back')) : undefined}
      onKeyDown={props.onKeyDown}
    >
      {!collapsed && draggable && (
        <div
          ref={handleRef}
          className={c('drag-handle')}
          role="separator"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={list.length - 1}
          aria-valuenow={list.indexOf(s.lastSnap)}
          aria-label={t('core.bottomSheet.resizeHandle')}
          tabIndex={0}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          onKeyDown={onHandleKeydown}
        />
      )}

      <div
        ref={headerRef}
        className={c('header', { 'header--drag': !collapsed && draggable })}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        {showBack && !collapsed && (
          <BaseIconButton
            name="arrow_back"
            variant="tonal"
            size="sm"
            label={t('core.drawer.back')}
            onClick={props.onBack}
          />
        )}
        {title ? (
          <h2 id={titleId} className={c('title')}>
            {title}
          </h2>
        ) : (
          <div className={c('title-spacer')} />
        )}
        {props.headerActions}
        {!collapsed && (
          <BaseIconButton
            name="close"
            variant="tonal"
            size="sm"
            label={t('core.drawer.close')}
            onClick={props.onClose}
          />
        )}
      </div>

      <div
        ref={contentRef}
        className={c('content')}
        style={collapsed ? { display: 'none' } : undefined}
      >
        {/* Natural height (never stretched): measuring it gives the fitted height. */}
        <div ref={bodyRef} className={c('content-body')}>
          {props.children}
        </div>
      </div>

      {hasFooter && (
        <div
          ref={footerRef}
          className={c('footer')}
          style={collapsed ? { display: 'none' } : undefined}
        >
          {props.footer}
        </div>
      )}
    </div>
  );
}
