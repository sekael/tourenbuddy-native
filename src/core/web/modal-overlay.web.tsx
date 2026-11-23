import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { AdaptiveOverlay } from './adaptive-overlay.web';
import type { OverlayProps } from './dialog-window.web';
import { fadeOut, useExitAnimation } from './use-exit-animation.web';
import { useIsDesktop } from './use-media-query.web';

/**
 * The PWA's stacked modal (teleported to <body>): on phones a scrim host (`.sheet-host--modal`,
 * global.css) whose tap outside closes it and which fades out with the sheet, on desktop the
 * dialog with its own backdrop. `className` gives the host the caller's scoped modifiers.
 */
export function ModalOverlay({
  className,
  fitContent,
  children,
  ...props
}: OverlayProps & { className?: string; fitContent?: boolean; children?: ReactNode }) {
  const isDesktop = useIsDesktop();
  const hostEl = useRef<HTMLDivElement>(null);
  useExitAnimation(hostEl, fadeOut);
  return createPortal(
    isDesktop ? (
      <AdaptiveOverlay {...props}>{children}</AdaptiveOverlay>
    ) : (
      <div
        ref={hostEl}
        className={['sheet-host sheet-host--modal', className].filter(Boolean).join(' ')}
        onClick={(e) => e.target === e.currentTarget && props.onClose?.()}
      >
        <AdaptiveOverlay {...props} fitContent={fitContent}>
          {children}
        </AdaptiveOverlay>
      </div>
    ),
    document.body,
  );
}
