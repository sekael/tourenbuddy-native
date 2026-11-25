import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import {
  GRADE_MAX_LENGTH,
  gradeLeads,
  gradeScales,
  toggleGrade,
} from '@/features/tours/data/models/grade';
import {
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
  type TourType,
} from '@/features/tours/data/models/tour-type';

import styles from './grade-chips.module.css';

const c = classes(styles);

/**
 * The selected activities' grade scales as one-tap chips, one row per scale led by its activity's
 * icon. A tap sets that scale's part and keeps the others ("S2, T4"), a lit chip clears it.
 */
export function GradeChips({
  value,
  tourTypes,
  disabled,
  onChange,
}: {
  value: string;
  tourTypes: readonly TourType[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  /** "zs-" still is ZS. */
  const lit = new Set(gradeLeads(value));
  function tap(grade: string) {
    const next = toggleGrade(value, grade);
    // ponytail: a hand-typed long grade can leave no room for another part: the tap does nothing.
    if (next.length <= GRADE_MAX_LENGTH) onChange(next);
  }
  return gradeScales(tourTypes).map((scale) => (
    <div
      key={scale.type}
      className={c('scale')}
      role="group"
      aria-label={t('tours.form.gradeScale', {
        activity: tk(`tours.type.${TOUR_TYPE_I18N_KEYS[scale.type]}`),
      })}
    >
      <BaseIcon name={TOUR_TYPE_ICONS[scale.type]} className={c('scale-icon')} />
      {scale.grades.map((grade) => (
        <button
          key={grade}
          type="button"
          className={c('chip', { selected: lit.has(grade) })}
          aria-pressed={lit.has(grade)}
          disabled={disabled}
          data-testid="grade-chip"
          onClick={() => tap(grade)}
        >
          {grade}
        </button>
      ))}
    </div>
  ));
}
