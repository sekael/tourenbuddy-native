import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { BaseIconButton } from './base-icon-button.web';
import { classes } from './classes';
import styles from './full-screen-page.module.css';
import { useExitAnimation } from './use-exit-animation.web';

const c = classes(styles);

/**
 * The PWA's mobile full-screen edit/create page: replaces the bottom sheet while the user enters
 * data. A fixed top bar holds the cancel control and `pageAction` (the Save button), so the primary
 * action never hides behind the keyboard. Rises in on mount, fades out on unmount over whatever
 * replaced it. Collapsed (a location pick needs the map): a title-only bar at the bottom, the form
 * staying mounted. Portaled to <body>, so a transforming sheet never becomes its containing block.
 */
export function FullScreenPage({
  title,
  ariaLabel,
  showBack,
  collapsed,
  onClose,
  onBack,
  pageAction,
  children,
}: {
  title?: string;
  ariaLabel?: string;
  showBack?: boolean;
  collapsed?: boolean;
  onClose?: () => void;
  onBack?: () => void;
  pageAction?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation('web');
  const pageRef = useRef<HTMLDivElement>(null);
  useExitAnimation(pageRef, (token) => ({
    frames: [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: `translateY(${token('--motion-offset')})` },
    ],
    duration: token('--motion-duration-short'),
    easing: token('--motion-ease-standard'),
  }));
  const titleId = 'full-screen-page-title';

  return createPortal(
    <div
      ref={pageRef}
      className={c('full-screen-page', { 'full-screen-page--collapsed': collapsed })}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? (ariaLabel ?? t('core.drawer.back')) : undefined}
    >
      <header className={c('page-bar')}>
        {!collapsed && (
          <BaseIconButton
            name={showBack ? 'arrow_back' : 'close'}
            variant="tonal"
            size="sm"
            label={showBack ? t('core.drawer.back') : t('core.drawer.close')}
            onClick={showBack ? onBack : onClose}
          />
        )}
        {title ? (
          <h2 id={titleId} className={c('title')}>
            {title}
          </h2>
        ) : (
          <div className={c('title-spacer')} />
        )}
        {!collapsed && <div className={c('page-action')}>{pageAction}</div>}
      </header>
      <div
        className={c('content')}
        style={collapsed ? { display: 'none' } : undefined}
        inert={collapsed || undefined}
        aria-hidden={collapsed || undefined}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
