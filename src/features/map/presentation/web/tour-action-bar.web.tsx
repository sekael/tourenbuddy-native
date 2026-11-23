import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { Transition } from '@/core/web/transition.web';

import styles from './tour-action-bar.module.css';

const c = classes(styles);

/** The bottom pill: "My tours" and "Add tour". Dismiss mode suppresses tooltips. */
export function TourActionBar({
  visible,
  toursDisabled,
  addTourDisabled,
  addTourTooltip,
  dismissMode,
  onTours,
  onAddTour,
}: {
  visible: boolean;
  toursDisabled: boolean;
  addTourDisabled: boolean;
  addTourTooltip?: string;
  dismissMode?: boolean;
  onTours: () => void;
  onAddTour: () => void;
}) {
  const { t } = useTranslation('web');
  return (
    <Transition name="pill" cls={c}>
      {visible && (
        <div className={c('pill tour-action-pill fab-glass')} role="group">
          <BaseTooltip text={t('map.actionBar.myTours')} disabled={dismissMode}>
            <button
              type="button"
              className={c('segment segment--tours')}
              data-tour="open-tours"
              disabled={toursDisabled}
              aria-disabled={toursDisabled}
              onClick={onTours}
            >
              <BaseIcon name="location_on" />
              <span className={c('segment-label')}>{t('map.actionBar.myTours')}</span>
            </button>
          </BaseTooltip>
          <div className={c('divider')} aria-hidden="true" />
          <BaseTooltip
            text={addTourTooltip ?? t('map.overlay.addTourTooltip')}
            disabled={dismissMode}
          >
            <button
              type="button"
              className={c('segment segment--add')}
              data-tour="add-tour"
              disabled={addTourDisabled}
              aria-disabled={addTourDisabled}
              aria-label={t('map.actionBar.addTourAriaLabel')}
              onClick={onAddTour}
            >
              <BaseIcon name="add_location_alt" />
            </button>
          </BaseTooltip>
        </div>
      )}
    </Transition>
  );
}
