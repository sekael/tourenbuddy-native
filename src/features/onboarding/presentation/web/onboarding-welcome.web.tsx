import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';

import styles from './onboarding-welcome.module.css';

const c = classes(styles);
/** `<Transition name="welcome">` around the welcome: its classes live in this module. */
export const welcomeCls = c;

/**
 * The welcome before an automatic start of a guided tour (the map's, or the calendar's with its
 * own copy), with its own backdrop. Start, skip for now, or don't show again.
 */
export function OnboardingWelcome({
  titleKey = 'onboarding.tour.welcome.title',
  bodyKey = 'onboarding.tour.welcome.body',
  icon = 'explore',
  onStart,
  onSkip,
  onDismiss,
  ref,
}: {
  titleKey?: string;
  bodyKey?: string;
  icon?: string;
  onStart: () => void;
  onSkip: () => void;
  onDismiss: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation('web');
  return (
    <div
      ref={ref}
      className={c('welcome-backdrop')}
      role="dialog"
      aria-modal="true"
      aria-label={t(titleKey as never)}
    >
      <div className={c('welcome-card')}>
        <span className={c('welcome-badge')} aria-hidden="true">
          <BaseIcon name={icon} className={c('welcome-icon')} />
        </span>
        <h2 className={c('welcome-title')}>{t(titleKey as never)}</h2>
        <p className={c('welcome-body')}>{t(bodyKey as never)}</p>
        <div className={c('welcome-actions')}>
          <BaseButton size="md" className={c('start-btn')} onClick={onStart}>
            {t('onboarding.tour.welcome.start')}
          </BaseButton>
          <BaseButton variant="secondary" size="md" className={c('skip-btn')} onClick={onSkip}>
            {t('onboarding.tour.welcome.skip')}
          </BaseButton>
          <BaseButton variant="text" size="sm" className={c('dismiss-btn')} onClick={onDismiss}>
            {t('onboarding.tour.welcome.dismiss')}
          </BaseButton>
        </div>
      </div>
    </div>
  );
}
