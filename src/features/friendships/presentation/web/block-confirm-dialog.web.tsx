import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';

import styles from './block-confirm-dialog.module.css';

const c = classes(styles);

/** Inline block confirmation, with an optional report reason. */
export function BlockConfirmDialog({
  hasFriendship,
  onCancel,
  onConfirm,
}: {
  hasFriendship: boolean;
  onCancel: () => void;
  onConfirm: (reportReason: string | null) => void;
}) {
  const { t } = useTranslation('web');
  const [reportEnabled, setReportEnabled] = useState(false);
  const [reportReason, setReportReason] = useState('');
  return (
    <div className={c('inline-confirm')} role="group" aria-label={t('blocks.confirm.title')}>
      <p className={c('confirm-title')}>{t('blocks.confirm.title')}</p>
      <p className={c('confirm-body')}>
        {hasFriendship ? t('blocks.confirm.bodyWithFriend') : t('blocks.confirm.bodyWithoutFriend')}
      </p>
      <p className={c('cooldown-notice')}>
        <BaseIcon name="schedule" className={c('notice-icon')} />
        {t('blocks.confirm.cooldownNotice')}
      </p>
      <label className={c('report-toggle')}>
        <input
          type="checkbox"
          checked={reportEnabled}
          onChange={(e) => setReportEnabled(e.target.checked)}
        />{' '}
        {t('blocks.confirm.reportToggle')}
      </label>
      {reportEnabled && (
        <textarea
          value={reportReason}
          className={c('report-input')}
          placeholder={t('blocks.confirm.reportPlaceholder')}
          maxLength={1000}
          rows={3}
          onChange={(e) => setReportReason(e.target.value)}
        />
      )}
      <div className={c('confirm-actions')}>
        <BaseButton type="button" variant="secondary" size="sm" onClick={onCancel}>
          {t('blocks.confirm.cancelBtn')}
        </BaseButton>
        <BaseButton
          type="button"
          variant="danger"
          size="sm"
          onClick={() => onConfirm(reportEnabled ? reportReason.trim() || null : null)}
        >
          {t('blocks.confirm.confirmBtn')}
        </BaseButton>
      </div>
    </div>
  );
}
