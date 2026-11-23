import { useTranslation } from 'react-i18next';

import { haversineMeters } from '@/core/utils/haversine';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';

import styles from './point-distance.module.css';

const c = classes(styles);
const FAR_M = 20_000;
type LngLat = { lng: number; lat: number };

/**
 * How far a start or landing lies from the goal (activity-legs): a search hit in the wrong valley
 * shows at a glance, and past `FAR_M` it warns.
 * ponytail: one threshold; a cross-country flight that lands farther just reads the warning.
 */
export function PointDistance({ goal, point }: { goal: LngLat; point: LngLat }) {
  const { t } = useTranslation('web');
  const { formatDistance } = useFormatter();
  const metres = haversineMeters([goal.lng, goal.lat], [point.lng, point.lat]);
  const far = metres > FAR_M;
  return (
    <span className={c('point-distance', { far })} data-testid="point-distance">
      {far && <BaseIcon name="warning" size="xs" className={c('icon')} />}{' '}
      {t(far ? 'tours.form.farFromGoal' : 'tours.form.fromGoal', {
        distance: formatDistance(metres),
      })}
    </span>
  );
}
