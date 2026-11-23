import { useTranslation } from 'react-i18next';

import { BaseButton } from './base-button.web';
import { classes } from './classes';
import { Transition } from './transition.web';
import styles from './update-prompt.module.css';
import { usePwaUpdate } from './use-pwa-update.web';

const c = classes(styles);

/** "A new version is ready": apply now, or later from the profile. */
export function UpdatePrompt() {
  const { t } = useTranslation('web');
  const { showBanner, applyUpdate, dismissBanner } = usePwaUpdate();
  return (
    <Transition name="banner" cls={c}>
      {showBanner && (
        <div key="banner" className={c('banner')} role="status">
          <div className={c('content')}>
            <p className={c('text')}>{t('core.pwa.update.message')}</p>
            <div className={c('actions')}>
              <BaseButton variant="text" size="sm" onClick={dismissBanner}>
                {t('core.pwa.update.dismiss')}
              </BaseButton>
              <BaseButton variant="primary" size="sm" onClick={applyUpdate}>
                {t('core.pwa.update.action')}
              </BaseButton>
            </div>
          </div>
        </div>
      )}
    </Transition>
  );
}
