import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import type { Trail } from '@/features/map/domain/entities/trail';
import { GradeBadge } from '@/features/tours/presentation/web/grade-badge.web';

import styles from './trail-candidate-list.module.css';
import { trailTitle } from './trail-title.web';

const c = classes(styles);

export function TrailCandidateList({
  candidates,
  more,
  onSelect,
}: {
  candidates: Trail[];
  more: number;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation('web');
  return (
    <ul className={c('list')}>
      {candidates.map((trail) => (
        <li key={trail.id}>
          <button type="button" className={c('row')} onClick={() => onSelect(trail.id)}>
            <BaseIcon name="downhill_skiing" className={c('icon')} />
            <span className={c('text')}>
              <span className={c('title')}>{trailTitle(trail, t as never)}</span>
              {trail.route?.name && <span className={c('sub')}>{trail.route.name}</span>}
            </span>
            {trail.route?.difficulty && <GradeBadge grade={trail.route.difficulty} />}
            <BaseIcon name="chevron_right" className={c('chevron')} />
          </button>
        </li>
      ))}
      {more > 0 && <li className={c('more')}>{t('map.trail.more', { count: more })}</li>}
    </ul>
  );
}
