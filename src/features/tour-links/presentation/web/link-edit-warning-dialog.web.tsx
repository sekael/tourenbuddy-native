import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { classes } from '@/core/web/classes';
import { ModalOverlay } from '@/core/web/modal-overlay.web';

import styles from './link-edit-warning-dialog.module.css';

const c = classes(styles);

export type LinkWarningMode = 'linked' | 'pending-outgoing' | 'pending-incoming' | 'pending-mixed';

/** Asks before an edit evicts the tour from its link group or voids pending link requests. */
export function LinkEditWarningDialog({
  linkedCount,
  pendingCount = 0,
  mode = 'linked',
  onConfirm,
  onCancel,
}: {
  /** Number of friend sibling tours the current tour is linked with. */
  linkedCount: number;
  /** Number of pending requests that would be invalidated. */
  pendingCount?: number;
  mode?: LinkWarningMode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('web');
  const title =
    mode === 'linked'
      ? t('tourLinks.editWarningTitle')
      : mode === 'pending-outgoing'
        ? t('tourLinks.editWarningPendingTitle')
        : t('tourLinks.editWarningIncomingTitle');
  const body =
    mode === 'linked'
      ? t('tourLinks.editWarningBody', { count: linkedCount })
      : mode === 'pending-outgoing'
        ? t('tourLinks.editWarningPendingBody', { count: pendingCount })
        : t('tourLinks.editWarningIncomingBody', { count: pendingCount });
  const proceedLabel =
    mode === 'linked'
      ? t('tourLinks.editWarningProceedBtn')
      : t('tourLinks.editWarningProceedPendingBtn');

  // Desktop: centred modal; phone: a bottom sheet stacked above the edit sheet.
  return (
    <ModalOverlay title={title} fitContent onClose={onCancel}>
      <div className={c('body')}>
        <p>{body}</p>
        <p className={c('hint')}>{t('tourLinks.editWarningHint')}</p>
      </div>
      <div className={c('actions')}>
        <BaseButton type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t('tours.infoSheet.cancelBtn')}
        </BaseButton>
        <BaseButton type="button" variant="danger" size="sm" onClick={onConfirm}>
          {proceedLabel}
        </BaseButton>
      </div>
    </ModalOverlay>
  );
}
