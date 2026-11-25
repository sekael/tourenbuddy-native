import { useTranslation } from 'react-i18next';

import { classes } from './classes';
import styles from './pace-badge.module.css';
import { formatPace, usePace } from './use-pace.web';

const c = classes(styles);

/** The user's pace beside a time taken at it ("1.2×"), only off the standard. */
export function PaceBadge() {
  const { t } = useTranslation('web');
  const pace = usePace();
  if (pace === 1) return null;
  return (
    <span className={c('pace-badge')} title={t('tours.route.pace')} data-testid="pace-badge">
      <span className={c('visually-hidden')}>{t('tours.route.pace')}</span>
      {formatPace(pace)}
    </span>
  );
}
