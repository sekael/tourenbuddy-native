import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import {
  FILTER_GRADE_SCALES,
  GRADE_SCALES,
  gradeLeads,
  gradeScaleOf,
} from '@/features/tours/data/models/grade';
import { SEASON_VALUES } from '@/features/tours/data/models/season';
import {
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
  TOUR_TYPE_VALUES,
} from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';

import styles from './tour-filters-panel.module.css';
import { useFriendOwnerOptions } from './use-friend-owner-options.web';
import type { CompletionFilter, TourFilters, TourTab } from './use-tour-filters.web';

const c = classes(styles);

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const completionOptions = [
  { value: 'all' as const, key: 'completionAll' },
  { value: 'open' as const, key: 'completionOpen' },
  { value: 'done' as const, key: 'completionDone' },
];

/** Local date as the date input writes it (the PWA wrote the ISO day). */
const dayValue = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : '');

export function TourFiltersPanel({
  filters,
  tab,
  tours,
  onChange,
}: {
  filters: TourFilters;
  /** My Tours filters by partner, Friends by who recorded the tour. */
  tab: TourTab;
  /** The tab's tours, unfiltered: which grade scales are worth offering. */
  tours: Tour[];
  onChange: (patch: Partial<TourFilters>) => void;
}) {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  const contacts = useContactsStore((s) => s.contacts);
  const partnerOptions = contacts.map((x) => ({ id: x.id, label: resolveContactName(x) }));
  const { owners, settled: ownersSettled } = useFriendOwnerOptions(filters);

  // ── Grade (#351) — depends on the tab's tours only, never on the selection's results: the
  // panel keeps its layout while chips are tapped.
  const scalesInUse = new Set(
    tours.flatMap((tour) => (tour.grade ? gradeLeads(tour.grade) : [])).map(gradeScaleOf),
  );
  /** Scales a tour uses, plus any holding a selected grade so it stays clearable. */
  const gradeScales = FILTER_GRADE_SCALES.filter(
    (s) => scalesInUse.has(s.grades) || s.grades.some((g) => filters.grades.has(g)),
  ).map((s) => ({
    ...s,
    // Every activity graded on it ("Ski tour, Splitboarding, …"), so the row needs no legend.
    activities: TOUR_TYPE_VALUES.filter((type) => GRADE_SCALES[type] === s.grades)
      .map((type) => tk(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}`))
      .join(', '),
  }));

  const chip = (active: boolean, label: string, onClick: () => void, key: string, extra = '') => (
    <button
      key={key}
      className={c(`chip ${extra}`, { active })}
      aria-pressed={active}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );

  return (
    <div className={c('filters-panel')}>
      {/* Friends: who recorded the tour. Held at one chip row until the names settle, so the
          groups below never jump when the chips arrive. */}
      {tab === 'friends' && owners.length > 0 && (
        <div className={c('filter-group')} data-testid="owner-filter">
          <p className={c('filter-label')}>{t('tours.filters.ownerLabel')}</p>
          <div className={c('chip-row')}>
            {ownersSettled &&
              owners.map((owner) =>
                chip(
                  filters.ownerIds.has(owner.id),
                  owner.label,
                  () => onChange({ ownerIds: toggled(filters.ownerIds, owner.id) }),
                  owner.id,
                ),
              )}
          </div>
        </div>
      )}

      {tab === 'owned' && partnerOptions.length > 0 && (
        <div className={c('filter-group')} data-testid="partner-filter">
          <p className={c('filter-label')}>{t('tours.filters.partnerLabel')}</p>
          <div className={c('chip-row')}>
            {partnerOptions.map((partner) =>
              chip(
                filters.partnerIds.has(partner.id),
                partner.label,
                () => onChange({ partnerIds: toggled(filters.partnerIds, partner.id) }),
                partner.id,
              ),
            )}
          </div>
        </div>
      )}

      <div className={c('filter-group')}>
        <p className={c('filter-label')}>{t('tours.filters.activityLabel')}</p>
        <div className={c('chip-row')}>
          {TOUR_TYPE_VALUES.map((type) =>
            chip(
              filters.tourTypes.has(type),
              tk(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}`),
              () => onChange({ tourTypes: toggled(filters.tourTypes, type) }),
              type,
            ),
          )}
        </div>
      </div>

      {gradeScales.length > 0 && (
        <div className={c('filter-group')} data-testid="grade-filter">
          <p className={c('filter-label')}>{t('tours.filters.gradeLabel')}</p>
          {gradeScales.map((scale) => (
            <div
              key={scale.type}
              className={c('chip-row chip-row--grades')}
              role="group"
              aria-label={t('tours.filters.gradeScale', { activities: scale.activities })}
            >
              <BaseIcon name={TOUR_TYPE_ICONS[scale.type]} className={c('scale-icon')} />
              {scale.grades.map((grade) =>
                chip(
                  filters.grades.has(grade),
                  grade,
                  () => onChange({ grades: toggled(filters.grades, grade) }),
                  grade,
                  'chip--grade',
                ),
              )}
            </div>
          ))}
        </div>
      )}

      <div className={c('filter-group')}>
        <p className={c('filter-label')}>{t('tours.filters.seasonLabel')}</p>
        <div className={c('chip-row')}>
          {SEASON_VALUES.map((season) =>
            chip(
              filters.seasons.has(season),
              tk(`tours.season.${season}`),
              () => onChange({ seasons: toggled(filters.seasons, season) }),
              season,
            ),
          )}
        </div>
      </div>

      <div className={c('filter-group')}>
        <p className={c('filter-label')}>{t('tours.filters.plannedDateLabel')}</p>
        <div className={c('date-row')}>
          <label className={c('date-field')}>
            <span className={c('date-label-text')}>{t('tours.filters.dateFromLabel')}</span>
            <input
              type="date"
              className={c('date-input')}
              value={dayValue(filters.dateFrom)}
              onChange={(e) =>
                onChange({ dateFrom: e.target.value ? new Date(e.target.value) : null })
              }
            />
          </label>
          <label className={c('date-field')}>
            <span className={c('date-label-text')}>{t('tours.filters.dateToLabel')}</span>
            <input
              type="date"
              className={c('date-input')}
              value={dayValue(filters.dateTo)}
              onChange={(e) =>
                onChange({ dateTo: e.target.value ? new Date(e.target.value) : null })
              }
            />
          </label>
        </div>
      </div>

      <div className={c('filter-group')}>
        <p className={c('filter-label')}>{t('tours.filters.statusLabel')}</p>
        <div
          className={c('segmented')}
          data-tab-indicator
          style={
            {
              '--tab-index': completionOptions.findIndex((o) => o.value === filters.completion),
              '--tab-count': completionOptions.length,
            } as CSSProperties
          }
        >
          {completionOptions.map((opt) => (
            <button
              key={opt.value}
              className={c('segment')}
              aria-pressed={filters.completion === opt.value}
              type="button"
              onClick={() => onChange({ completion: opt.value as CompletionFilter })}
            >
              {tk(`tours.filters.${opt.key}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
