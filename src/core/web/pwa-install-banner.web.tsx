import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from './base-button.web';
import { classes } from './classes';
import styles from './pwa-install-banner.module.css';
import { Transition } from './transition.web';

const c = classes(styles);

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** "Install TourenBuddy" where the browser offers it (Chrome's install prompt). */
export function PwaInstallBanner() {
  const { t } = useTranslation('web');
  const [isVisible, setIsVisible] = useState(false);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setIsVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  async function handleInstall() {
    const prompt = deferred.current;
    if (!prompt) return;
    await prompt.prompt();
    if ((await prompt.userChoice).outcome === 'accepted') deferred.current = null;
    setIsVisible(false);
  }

  return (
    <Transition name="banner" cls={c}>
      {isVisible && (
        <div key="banner" className={c('banner')} role="banner">
          <div className={c('content')}>
            <p className={c('text')}>{t('core.pwa.banner.message')}</p>
            <div className={c('actions')}>
              <BaseButton variant="text" size="sm" onClick={() => setIsVisible(false)}>
                {t('core.pwa.banner.dismiss')}
              </BaseButton>
              <BaseButton variant="primary" size="sm" onClick={() => void handleInstall()}>
                {t('core.pwa.banner.install')}
              </BaseButton>
            </div>
          </div>
        </div>
      )}
    </Transition>
  );
}
