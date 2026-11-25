import { useEffect, useRef, useState, type ReactNode } from 'react';

import { BaseIconButton } from './base-icon-button.web';
import { classes } from './classes';
import styles from './dialog-window.module.css';

const c = classes(styles);

export type OverlayProps = {
  title?: string;
  ariaLabel?: string;
  /** Collapse to a header-only card; no backdrop dismissal, no close button. */
  collapsed?: boolean;
  showBack?: boolean;
  onClose?: () => void;
  onBack?: () => void;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Vue's fallthrough `@keydown` on the overlay's root (runs before the window's Escape). */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  ref?: React.Ref<HTMLDivElement>;
};

/**
 * The PWA's desktop dialog: always as tall as its content. The body keeps its natural height, so
 * measuring it as it changes gives the scroll box's height, which glides to it both ways; the
 * card's max-height caps it. The first size lands without a glide.
 */
export function DialogWindow({
  title,
  ariaLabel,
  collapsed,
  showBack,
  onClose,
  onBack,
  headerActions,
  footer,
  children,
  ref,
}: OverlayProps) {
  const body = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);
  const [glide, setGlide] = useState(false);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setBodyHeight(
        Math.ceil(
          entry!.borderBoxSize?.[0]?.blockSize ?? (entry!.target as HTMLElement).offsetHeight,
        ),
      );
    });
    observer.observe(body.current!);
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setGlide(true))));
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const titleId = 'dialog-window-title';
  return (
    <div
      ref={ref}
      className={c('dialog-backdrop', { 'dialog-backdrop--collapsed': collapsed })}
      onClick={(e) => e.target === e.currentTarget && !collapsed && onClose?.()}
    >
      <div
        className={c('dialog-card', { 'dialog-card--collapsed': collapsed })}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? (ariaLabel ?? 'Dialog') : undefined}
      >
        <div className={c('dialog-header')}>
          {showBack && !collapsed && (
            <BaseIconButton
              name="arrow_back"
              variant="tonal"
              size="sm"
              label="Back"
              onClick={onBack}
            />
          )}
          {title ? (
            <h2 id={titleId} className={c('dialog-title')}>
              {title}
            </h2>
          ) : (
            <div className={c('title-spacer')} />
          )}
          {headerActions}
          {!collapsed && (
            <BaseIconButton
              name="close"
              variant="tonal"
              size="sm"
              label="Close"
              onClick={onClose}
            />
          )}
        </div>
        <div
          className={c('dialog-content', { 'dialog-content--glide': glide })}
          style={bodyHeight === null || collapsed ? undefined : { height: `${bodyHeight}px` }}
          inert={collapsed || undefined}
          aria-hidden={collapsed || undefined}
        >
          <div ref={body} className={c('dialog-body')}>
            {children}
          </div>
        </div>
        {footer && !collapsed && <div className={c('dialog-footer')}>{footer}</div>}
      </div>
    </div>
  );
}
