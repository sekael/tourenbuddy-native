import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { classes } from '@/core/web/classes';
import { usePwaUpdate } from '@/core/web/use-pwa-update.web';

import styles from './app-update-notice.module.css';

const c = classes(styles);

/**
 * First row of the profile while an update waits: the speed-dial dot leads here, so the reason
 * shows without scrolling. Unaffected by dismissing the banner.
 */
export function AppUpdateNotice() {
  const { t } = useTranslation('web');
  const { updateAvailable, applyUpdate } = usePwaUpdate();
  if (!updateAvailable) return null;
  return (
    <div className={c('notice')} role="status" data-testid="app-update-notice">
      <span className={c('text')}>{t('core.pwa.update.message')}</span>
      <BaseButton variant="primary" size="sm" onClick={applyUpdate}>
        {t('core.pwa.update.action')}
      </BaseButton>
    </div>
  );
}
