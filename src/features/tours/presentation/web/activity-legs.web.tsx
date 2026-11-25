import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import type { LegDirection } from '@/features/tours/domain/legs';

import styles from './activity-legs.module.css';

const c = classes(styles);
const WAYS = [
  { value: 'up', icon: 'arrow_upward' },
  { value: 'both', icon: 'swap_vert' },
  { value: 'down', icon: 'arrow_downward' },
] as const;

/**
 * Which way each activity goes (activity-legs D3): one line per selected activity, up (start →
 * goal), both, down (goal → end). The form owns the choices and which are allowed.
 */
export function ActivityLegs({
  types,
  direction,
  allowed,
  solo,
  onSet,
}: {
  types: readonly TourType[];
  direction: (type: TourType) => LegDirection;
  allowed: (type: TourType, way: LegDirection) => boolean;
  /** A lone glider: flown from the goal only, or the whole way from the start (thermals). */
  solo?: boolean;
  onSet: (type: TourType, direction: LegDirection) => void;
}) {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const activity = (type: TourType) => tk(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}`);
  const ways = solo ? WAYS.filter((way) => way.value !== 'up') : WAYS;
  /** A greyed way says why, beneath the lines: a disabled button can't be tapped for it. */
  const blocked = types.some((type) => WAYS.some((way) => !allowed(type, way.value)));
  return (
    <fieldset className={c('legs')} data-testid="activity-legs">
      <legend className={c('label')}>{t('tours.form.legs.label')}</legend>
      {types.map((type) => (
        <div key={type} className={c('leg')} data-leg={type}>
          <span
            className={c('leg-type')}
            style={{ '--leg-color': TOUR_TYPE_COLORS[type] } as CSSProperties}
          >
            <BaseIcon name={TOUR_TYPE_ICONS[type]} className={c('leg-icon')} />
            <span className={c('leg-name')}>{activity(type)}</span>
          </span>
          <span className={c('ways')} role="radiogroup" aria-label={activity(type)}>
            {ways.map((way) => {
              const ok = allowed(type, way.value);
              const on = direction(type) === way.value;
              return (
                <button
                  key={way.value}
                  type="button"
                  role="radio"
                  className={c('way', { selected: on })}
                  aria-checked={on}
                  disabled={!ok}
                  title={ok ? undefined : t('tours.form.legs.needsOne')}
                  data-way={way.value}
                  onClick={() => onSet(type, way.value)}
                >
                  <BaseIcon name={way.icon} size="sm" />
                  {tk(`tours.form.legs.${way.value}`)}
                </button>
              );
            })}
          </span>
        </div>
      ))}
      <p className={c('hint')}>
        {t(solo ? 'tours.form.legs.soloHint' : 'tours.form.legs.hint')}
        {blocked && ` ${t('tours.form.legs.needsOne')}`}
      </p>
    </fieldset>
  );
}
