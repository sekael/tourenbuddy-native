import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BottomSheet } from '@/core/web/bottom-sheet.web';
import { classes } from '@/core/web/classes';
import { DialogWindow } from '@/core/web/dialog-window.web';
import { fadeOut, useExitAnimation } from '@/core/web/use-exit-animation.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';

import styles from './delete-account-dialog.module.css';

const c = classes(styles);

/** The PWA's account deletion confirmation: names what goes; it cannot be dismissed while deleting. */
export function DeleteAccountDialog({
  deleting,
  error,
  onConfirm,
  onCancel,
}: {
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('web');
  const isDesktop = useIsDesktop();
  const hostEl = useRef<HTMLDivElement>(null);
  useExitAnimation(hostEl, fadeOut);
  const cancel = () => {
    if (!deleting) onCancel();
  };

  const content = (
    <>
      <div className={c('body')}>
        <p>{t('user.profile.deleteAccount.body')}</p>
        <p className={c('hint')}>{t('user.profile.deleteAccount.hint')}</p>
        {error && (
          <p className={c('error')} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={c('actions')}>
        <BaseButton variant="secondary" size="sm" disabled={deleting} onClick={onCancel}>
          {t('user.shared.cancelBtn')}
        </BaseButton>
        <BaseButton
          variant="danger"
          size="sm"
          disabled={deleting}
          data-testid="delete-account-confirm"
          onClick={onConfirm}
        >
          {deleting
            ? t('user.profile.deleteAccount.deleting')
            : t('user.profile.deleteAccount.confirmBtn')}
        </BaseButton>
      </div>
    </>
  );

  return createPortal(
    isDesktop ? (
      <DialogWindow title={t('user.profile.deleteAccount.title')} onClose={cancel}>
        {content}
      </DialogWindow>
    ) : (
      <div
        ref={hostEl}
        className={c('sheet-host sheet-host--modal')}
        onClick={(e) => e.target === e.currentTarget && cancel()}
      >
        <BottomSheet title={t('user.profile.deleteAccount.title')} fitContent onClose={cancel}>
          {content}
        </BottomSheet>
      </div>
    ),
    document.body,
  );
}
