import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { Transition } from '@/core/web/transition.web';

import styles from './onboarding-tour-banner.module.css';

const c = classes(styles);
/** `<Transition name="tour-slide">` around the banner: its classes live in this module. */
export const tourSlideCls = c;

/**
 * The guided tour's banner, pinned at the top: the step's label, progress, finish, back and next.
 * Its height is published as `--onboarding-tour-banner-h` for content that keeps clear of it.
 */
export function OnboardingTourBanner({
  title,
  current,
  total,
  canBack,
  busy,
  onBack,
  onNext,
  onFinish,
  ref,
}: {
  title: string;
  current: number;
  total: number;
  canBack: boolean;
  busy?: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation('web');
  const banner = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        '--onboarding-tour-banner-h',
        `${entry!.borderBoxSize[0]!.blockSize}px`,
      );
    });
    observer.observe(banner.current!);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--onboarding-tour-banner-h');
    };
  }, []);

  return (
    <div
      ref={(node) => {
        banner.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={c('tour-banner fab-glass')}
      role="region"
      aria-label={t('onboarding.tour.bannerLabel')}
    >
      {/* Keyed on the title: the old label fades up and out, the new one rises in. */}
      <Transition name="title-swap" cls={c}>
        <span key={title} className={c('step-title')}>
          {title}
        </span>
      </Transition>
      <div
        className={c('progress-track')}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
      >
        <div className={c('progress-fill')} style={{ transform: `scaleX(${current / total})` }} />
      </div>
      <div className={c('controls')}>
        <BaseButton variant="secondary" size="sm" className={c('finish-btn')} onClick={onFinish}>
          {t('onboarding.tour.controls.finish')}
        </BaseButton>
        <span className={c('progress')} aria-live="polite">
          {current} / {total}
        </span>
        <div className={c('nav')}>
          <BaseIconButton
            name="arrow_back"
            label={t('onboarding.tour.controls.previous')}
            size="sm"
            className={c('nav-btn')}
            disabled={!canBack || busy}
            onClick={onBack}
          />
          <BaseIconButton
            name="arrow_forward"
            label={t('onboarding.tour.controls.next')}
            size="sm"
            className={c('nav-btn nav-btn--next')}
            disabled={busy}
            onClick={onNext}
          />
        </div>
      </div>
    </div>
  );
}
