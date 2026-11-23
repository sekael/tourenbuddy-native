import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { SEASON_AXIS, seasonRuns } from '@/features/calendar/domain/season-runs';
import type { Season } from '@/features/tours/data/models/season';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
} from '@/features/tours/data/models/tour-type';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './seasons-gantt.module.css';

const c = classes(styles);

/**
 * The seasons view: the user's own tours across winter · spring · summer · autumn, one bar per
 * contiguous run, with a "you are here" line at the current month.
 */
export function SeasonsGantt({
  demoTour,
  onSelect,
}: {
  /** The calendar tour's demo bar: non-null only while the tour runs. */
  demoTour?: { name: string; seasons: Season[] } | null;
  onSelect: (tourId: string) => void;
}) {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  // Own tours only: friend tours never appear here.
  const tours = useToursStore((s) => s.tours);
  // The axis runs Dec → Nov (winter first): month 11 is index 0; the line sits mid-month.
  const fraction = (((new Date().getMonth() + 1) % 12) + 0.5) / 12;
  const nowLineLeft = `calc(var(--label-w) + (100% - var(--label-w)) * ${fraction})`;
  const bars = (seasons: Season[] | null, color?: string) =>
    seasonRuns(seasons).map((run, i) => (
      <div
        key={i}
        className={c('season-bar')}
        style={{ gridColumn: `${run.start + 2} / span ${run.span}`, backgroundColor: color }}
      />
    ));

  return (
    <div className={c('gantt-wrap')}>
      {tours.length === 0 && !demoTour ? (
        <div className={c('gantt-empty')}>
          <BaseIcon name="wb_sunny" size="lg" />
          <p>{t('calendar.seasons.emptyState')}</p>
        </div>
      ) : (
        <div className={c('gantt')}>
          <div className={c('gantt-track')}>
            <div className={c('gantt-row gantt-header')}>
              <div className={c('header-label')}>{t('calendar.title')}</div>
              {SEASON_AXIS.map((season) => (
                <div key={season} className={c('header-season')}>
                  <span className={c('season-name')}>{tk(`tours.season.${season}`)}</span>
                  <span className={c('season-range')}>
                    {tk(`calendar.seasons.range.${season}`)}
                  </span>
                </div>
              ))}
            </div>
            <div className={c('gantt-rows')}>
              <div
                className={c('season-now-line')}
                style={{ left: nowLineLeft }}
                aria-hidden="true"
              />
              {demoTour && (
                <div className={c('gantt-row gantt-tour-row')} data-tour="demo-row">
                  <div className={c('row-label')}>
                    <span className={c('tour-name')}>{demoTour.name}</span>
                  </div>
                  {bars(demoTour.seasons)}
                </div>
              )}
              {tours.map((tour) => {
                const type = tour.tourTypes[0];
                return (
                  <button
                    key={tour.id}
                    type="button"
                    className={c('gantt-row gantt-tour-row')}
                    onClick={() => onSelect(tour.id)}
                  >
                    <div className={c('row-label')}>
                      <span className={c('tour-name')}>
                        {tour.name ?? t('tours.infoSheet.unnamedTour')}
                      </span>
                      {type && (
                        <span className={c('tour-type')}>
                          <BaseIcon name={TOUR_TYPE_ICONS[type]} size="xs" />
                          {tour.tourTypes
                            .map((x) => tk(`tours.type.${TOUR_TYPE_I18N_KEYS[x]}`))
                            .join(', ')}
                        </span>
                      )}
                    </div>
                    {/* Untyped tours keep the CSS default (primary). */}
                    {seasonRuns(tour.seasons).length > 0 ? (
                      bars(tour.seasons, type ? TOUR_TYPE_COLORS[type] : undefined)
                    ) : (
                      <span className={c('no-seasons')}>{t('calendar.seasons.empty')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {(tours.length > 0 || demoTour) && (
        <p className={c('scroll-hint')}>
          <BaseIcon name="sync_alt" size="xs" />
          {t('calendar.seasons.scrollHint')}
        </p>
      )}
    </div>
  );
}
