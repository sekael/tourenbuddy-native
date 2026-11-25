import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIconButton } from './base-icon-button.web';
import { BottomSheet } from './bottom-sheet.web';
import { classes } from './classes';
import styles from './side-drawer.module.css';
import { useIsDesktop } from './use-media-query.web';

const c = classes(styles);

/**
 * The PWA's `<SideDrawer>`: a bottom sheet on phones, a right-edge drawer without backdrop from
 * 600 px. Collapsed it shrinks to its header, the content staying mounted. Escape closes it like
 * its ×, unless typing in a field, a dialog is stacked above, or a control already spent the key.
 */
export function SideDrawer({
  title,
  ariaLabel,
  collapsed,
  backLabel,
  onClose,
  onBack,
  headerActions,
  footer,
  children,
  onKeyDown,
  ref,
}: {
  title?: string;
  ariaLabel?: string;
  collapsed?: boolean;
  backLabel?: string;
  onClose?: () => void;
  onBack?: () => void;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation('web');
  const isDesktop = useIsDesktop();
  const drawerEl = useRef<HTMLDivElement | null>(null);

  const onEscape = useEffectEvent((e: KeyboardEvent) => {
    const el = drawerEl.current;
    if (e.key !== 'Escape' || !el || collapsed || e.defaultPrevented) return;
    if (
      (e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')
    )
      return;
    if ([...document.querySelectorAll('[aria-modal="true"]')].at(-1) !== el) return;
    onClose?.();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onEscape(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (!isDesktop)
    return (
      <BottomSheet
        ref={ref}
        title={title}
        ariaLabel={ariaLabel}
        collapsed={collapsed}
        showBack={!!backLabel}
        onClose={onClose}
        onBack={onBack}
        headerActions={headerActions}
        footer={footer}
        onKeyDown={onKeyDown}
      >
        {children}
      </BottomSheet>
    );

  return (
    <div
      ref={(node) => {
        drawerEl.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={c('side-drawer', { 'side-drawer--collapsed': collapsed })}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? ariaLabel ?? t('core.drawer.close')}
      onKeyDown={onKeyDown}
    >
      <div className={c('drawer-header')}>
        {backLabel && !collapsed && (
          <BaseIconButton
            name="arrow_back"
            variant="tonal"
            size="sm"
            label={`${t('core.drawer.back')} ${backLabel}`}
            onClick={onBack}
          />
        )}
        {title ? (
          <h2 className={c('drawer-title')}>{title}</h2>
        ) : (
          <div className={c('title-spacer')} />
        )}
        {headerActions}
        {!collapsed && (
          <BaseIconButton
            name="close"
            variant="tonal"
            size="sm"
            label={t('core.drawer.close')}
            onClick={onClose}
          />
        )}
      </div>
      <div
        className={c('drawer-content')}
        inert={collapsed || undefined}
        aria-hidden={collapsed || undefined}
      >
        {children}
      </div>
      {footer && (
        <div
          className={c('drawer-footer')}
          inert={collapsed || undefined}
          aria-hidden={collapsed || undefined}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
