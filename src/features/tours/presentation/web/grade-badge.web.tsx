import { useTranslation } from 'react-i18next';

import { classes, join } from '@/core/web/classes';

import styles from './grade-badge.module.css';

const c = classes(styles);

/** A tour's grade as an outlined badge, sized by its context. */
export function GradeBadge({ grade, className }: { grade: string; className?: string }) {
  const { t } = useTranslation('web');
  return (
    <span className={join(c('grade-badge'), className)} data-testid="tour-grade">
      <span className={c('visually-hidden')}>{t('tours.suggestions.fields.grade')}</span>
      {grade}
    </span>
  );
}
