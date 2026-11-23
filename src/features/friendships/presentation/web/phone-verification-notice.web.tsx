import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { ModalOverlay } from '@/core/web/modal-overlay.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';

import styles from './phone-verification-notice.module.css';

const c = classes(styles);

/** The PWA's notice before a phone code is sent: friends can find you by the number. */
export function PhoneVerificationNotice({
  onAcknowledged,
  onClose,
}: {
  onAcknowledged: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('web');
  const isDesktop = useIsDesktop();
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <ModalOverlay
      className={c('sheet-host--modal')}
      title={t('friendships.verificationNotice.title')}
      onClose={onClose}
    >
      <div className={c('notice-content')}>
        <div className={c('notice-body')}>
          <BaseIcon name="privacy_tip" className={c('notice-icon')} />
          <p className={c('notice-text')}>{t('friendships.verificationNotice.body')}</p>
        </div>
        <label className={c('checkbox-row')}>
          <input
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            type="checkbox"
            className={c('checkbox')}
          />
          <span className={c('checkbox-label')}>
            {t('friendships.verificationNotice.acknowledge')}
          </span>
        </label>
        <BaseButton variant="primary" disabled={!acknowledged} onClick={onAcknowledged}>
          {isDesktop
            ? t('friendships.verificationNotice.acknowledge')
            : t('friendships.verificationNotice.sendCodeBtn')}
        </BaseButton>
      </div>
    </ModalOverlay>
  );
}
