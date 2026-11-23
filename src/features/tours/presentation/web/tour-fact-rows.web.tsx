import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import type { Season } from '@/features/tours/data/models/season';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
} from '@/features/tours/data/models/tour-type';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { landsByAir, legsApart } from '@/features/tours/domain/legs';

import { GradeBadge } from './grade-badge.web';
import styles from './tour-fact-rows.module.css';

const c = classes(styles);

const SEASON_ICONS: Record<Season, string> = {
  winter: 'ac_unit',
  spring: 'local_florist',
  summer: 'wb_sunny',
  autumn: 'eco',
};

const pointText = (p: { lng: number; lat: number } | null) =>
  p ? `${p.lat.toFixed(4)}°N, ${p.lng.toFixed(4)}°E` : null;

/** Auto-link URLs in plain text: returns array of segments {text, url?}. */
function linkifyText(text: string): { text: string; url?: string }[] {
  const urlPattern = /https?:\/\/[^\s<>[\]{}|\\^`"]+/g;
  const segments: { text: string; url?: string }[] = [];
  let lastIndex = 0;
  for (let match = urlPattern.exec(text); match !== null; match = urlPattern.exec(text)) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index) });
    segments.push({ text: match[0], url: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex) });
  return segments.length > 0 ? segments : [{ text }];
}

/**
 * A tour's facts as dense icon-led rows, grouped by what belongs together: activity, route,
 * partners, free texts — a divider above each group. Start and End carry a short visible label;
 * every other row is named for assistive tech only. Partners and the route's GPX download come in
 * through slots so the sheet keeps the wiring.
 */
export function TourFactRows({
  tour,
  route,
  partners,
}: {
  tour: Tour;
  route?: ReactNode;
  partners?: ReactNode;
}) {
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string) => string;
  const { formatElevation } = useFormatter();

  const startPointText = pointText(tour.startPoint);
  const endPointText = pointText(tour.endPoint);
  const isOneWayToGoal = !!tour.startPoint && !tour.endPoint;
  /** Same place as the map's markers and connector take it (within 10 m), not the same digits. */
  const isRoundTrip =
    !!tour.startPoint && !!tour.endPoint && isSameGoal(tour.startPoint, tour.endPoint);
  /** Activities as groups: one for an unsplit tour, the way up and the way down for a split one. */
  const legs = legsApart(tour.legs);
  const typeGroups = legs
    ? [
        { way: 'up' as const, types: legs.ascent },
        { way: 'down' as const, types: legs.descent },
      ]
    : [{ way: null, types: tour.tourTypes }];
  /** A flown way down ends in a landing. */
  const landing = landsByAir(tour);
  const endValue = isOneWayToGoal
    ? landing
      ? t('tours.infoSheet.landingOpen')
      : t('tours.infoSheet.oneWayToGoalIndicator')
    : isRoundTrip
      ? t('tours.infoSheet.roundTrip')
      : (tour.endPointName ?? endPointText);
  const endElevation =
    isOneWayToGoal || isRoundTrip || !tour.endPointName ? null : tour.endPointElevation;

  return (
    <div className={c('fact-rows')}>
      {(tour.tourTypes.length > 0 || tour.grade || !!tour.seasons?.length) && (
        <ul className={c('fact-group')}>
          {/* Chips carry their own icons, so they take the icon column too. */}
          {(tour.tourTypes.length > 0 || tour.grade) && (
            <li className={c('fact-row fact-row--wide')} data-fact="type">
              <span className={c('visually-hidden')}>{t('tours.infoSheet.iconTooltipType')}</span>
              {/* A split tour: the way up, then the way down, each led by its arrow. */}
              {typeGroups.map((group) => (
                <span
                  key={group.way ?? 'all'}
                  className={c('type-group')}
                  data-leg={group.way ?? undefined}
                >
                  {group.way && (
                    <>
                      <BaseIcon
                        name={group.way === 'up' ? 'arrow_upward' : 'arrow_downward'}
                        size="sm"
                        className={c('leg-arrow')}
                      />
                      <span className={c('visually-hidden')}>
                        {group.way === 'up'
                          ? t('tours.infoSheet.wayUp')
                          : t('tours.infoSheet.wayDown')}
                      </span>
                    </>
                  )}
                  {group.types.map((type) => (
                    <span
                      key={type}
                      className={c('tag type-tag')}
                      style={{ '--tag-color': TOUR_TYPE_COLORS[type] } as CSSProperties}
                    >
                      <BaseIcon name={TOUR_TYPE_ICONS[type]} size="sm" />
                      {tk(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}`)}
                    </span>
                  ))}
                </span>
              ))}
              {tour.grade && <GradeBadge grade={tour.grade} />}
            </li>
          )}
          {!!tour.seasons?.length && (
            <li className={c('fact-row fact-row--wide')} data-fact="seasons">
              <span className={c('visually-hidden')}>
                {t('tours.infoSheet.iconTooltipSeasons')}
              </span>
              {tour.seasons.map((season) => (
                <span key={season} className={c('tag season-tag')}>
                  <BaseIcon name={SEASON_ICONS[season]} size="sm" />
                  {tk(`tours.season.${season}`)}
                </span>
              ))}
            </li>
          )}
        </ul>
      )}

      {(startPointText || endPointText || route) && (
        <ul className={c('fact-group')}>
          {/* An end without a start (a connected stage) shows on its own. */}
          {(startPointText || endPointText) && (
            <>
              {startPointText && (
                <li className={c('fact-row')} data-fact="start">
                  {/* The form's point icons (D22): ring = start, flag = goal, chequered flag = end. */}
                  <BaseIcon name="trip_origin" size="sm" className={c('row-icon')} />
                  <span className={c('row-value')}>
                    <span className={c('row-label')}>{t('tours.infoSheet.startShort')}</span>
                    <span className={c({ coords: !tour.startPointName })}>
                      {tour.startPointName ?? startPointText}
                    </span>
                    {tour.startPointName && tour.startPointElevation != null && (
                      <span className={c('row-sub')}>
                        {formatElevation(tour.startPointElevation)}
                      </span>
                    )}
                  </span>
                </li>
              )}
              <li className={c('fact-row')} data-fact="end">
                <BaseIcon
                  name={isOneWayToGoal ? 'flag' : 'sports_score'}
                  size="sm"
                  className={c('row-icon')}
                />
                <span className={c('row-value')}>
                  <span className={c('row-label')}>
                    {landing ? t('tours.infoSheet.landingShort') : t('tours.infoSheet.endShort')}
                  </span>
                  <span className={c({ coords: endValue === endPointText })}>{endValue}</span>
                  {endElevation != null && (
                    <span className={c('row-sub')}>{formatElevation(endElevation)}</span>
                  )}
                </span>
              </li>
            </>
          )}
          {/* The route's own file (GPX); the sheet owns the download. */}
          {route && <li data-fact="track">{route}</li>}
        </ul>
      )}

      {partners && (
        <ul className={c('fact-group')}>
          <li className={c('fact-row')} data-fact="partners">
            <BaseIcon name="group" size="sm" className={c('row-icon')} />
            <span className={c('visually-hidden')}>{t('tours.infoSheet.iconTooltipPartners')}</span>
            <div className={c('row-value')}>{partners}</div>
          </li>
        </ul>
      )}

      {(tour.description || tour.equipment || tour.notes) && (
        <ul className={c('fact-group')}>
          {tour.description && (
            <li className={c('fact-row')} data-fact="description">
              <BaseIcon name="description" size="sm" className={c('row-icon')} />
              <span className={c('visually-hidden')}>
                {t('tours.infoSheet.iconTooltipDescription')}
              </span>
              <p className={c('row-value body-text')}>
                {linkifyText(tour.description).map((segment, i) =>
                  segment.url ? (
                    <a
                      key={i}
                      href={segment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={c('description-link')}
                    >
                      {segment.text}
                    </a>
                  ) : (
                    segment.text
                  ),
                )}
              </p>
            </li>
          )}
          {tour.equipment && (
            <li className={c('fact-row')} data-fact="equipment">
              <BaseIcon name="ice_axe" size="sm" className={c('row-icon')} />
              <span className={c('visually-hidden')}>
                {t('tours.infoSheet.iconTooltipEquipment')}
              </span>
              <p className={c('row-value body-text')}>{tour.equipment}</p>
            </li>
          )}
          {tour.notes && (
            <li className={c('fact-row')} data-fact="notes">
              <BaseIcon name="sticky_note_2" size="sm" className={c('row-icon')} />
              <span className={c('visually-hidden')}>{t('tours.infoSheet.iconTooltipNotes')}</span>
              <p className={c('row-value body-text')}>{tour.notes}</p>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
