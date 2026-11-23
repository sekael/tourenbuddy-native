import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BottomSheet } from '@/core/web/bottom-sheet.web';
import { classes } from '@/core/web/classes';
import { PaceBadge } from '@/core/web/pace-badge.web';
import { SideDrawer } from '@/core/web/side-drawer.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { usePace } from '@/core/web/use-pace.web';
import type { Trail } from '@/features/map/domain/entities/trail';
import { labelMinutes } from '@/features/tours/domain/route-metrics';
import { GradeBadge } from '@/features/tours/presentation/web/grade-badge.web';
import { RouteNumbers } from '@/features/tours/presentation/web/route-numbers.web';
import { TourTypeBadge } from '@/features/tours/presentation/web/tour-type-badge.web';

import { useMapStore } from './map-store.web';
import { TrailCandidateList } from './trail-candidate-list.web';
import styles from './trail-card.module.css';
import { trailTitle } from './trail-title.web';

const c = classes(styles);

/** A tapped ski route: the list when several lie under the finger, else its details. */
export function TrailCard({
  onClose,
  onPlan,
}: {
  onClose: () => void;
  onPlan: (trail: Trail) => void;
}) {
  const { t } = useTranslation('web');
  const { formatElevation, formatDuration } = useFormatter();
  const isDesktop = useIsDesktop();
  const pace = usePace();
  const trailCard = useMapStore((s) => s.trailCard);
  const selectTrail = useMapStore((s) => s.selectTrail);
  if (!trailCard) return null;

  const selected = trailCard.candidates.find((x) => x.id === trailCard.selectedId) ?? null;
  const route = selected?.route ?? null;
  /** Back to the list only when the details were opened from one. */
  const fromList = selected !== null && trailCard.candidates.length > 1;
  /** Details read like a tour's (design D10): the summit as title, its altitude leads the hero. */
  const title = !selected
    ? t('map.trail.listTitle', { count: trailCard.candidates.length + trailCard.more })
    : route?.targetName || trailTitle(selected, t as never);
  /** SAC's ascent time at the user's pace, as every time the app shows; an odd label as it is. */
  const label = route?.ascentTime;
  const minutes = label ? labelMinutes(label) : null;
  const ascentTime = minutes == null ? label : formatDuration(Math.round(minutes / pace));

  const body = (
    <div className={c('body')}>
      {!selected ? (
        <TrailCandidateList
          candidates={trailCard.candidates}
          more={trailCard.more}
          onSelect={selectTrail}
        />
      ) : route ? (
        <>
          <div className={c('hero')}>
            <TourTypeBadge types={['skitour']} className={c('hero-badge')} />
            <div className={c('hero-text')}>
              {route.targetAltitude != null && (
                <span className={c('hero-headline')}>
                  <BaseIcon name="landscape" size="sm" className={c('hero-headline-icon')} />
                  {formatElevation(route.targetAltitude)}
                </span>
              )}
              {route.name && <span className={c('hero-name')}>{route.name}</span>}
              {/* Separate items: a wrap falls between them, never inside one. */}
              <span className={c('hero-meta')}>
                {route.difficulty && <GradeBadge grade={route.difficulty} />}
                {ascentTime && (
                  <span className={c('fact')} data-testid="trail-ascent-time">
                    <BaseIcon name="schedule" size="sm" />
                    {t('tours.route.ascent')} {ascentTime}
                    <PaceBadge />
                  </span>
                )}
                <RouteNumbers
                  metrics={{
                    ascent: route.ascentM ?? null,
                    descent: route.descentM ?? null,
                    distance: null,
                  }}
                />
              </span>
            </div>
          </div>
          <div className={c('actions')}>
            <BaseButton
              variant="primary"
              data-testid="trail-plan-tour"
              onClick={() => onPlan(selected)}
            >
              <BaseIcon name="add_location_alt" />
              {t('map.trail.planTour')}
            </BaseButton>
            {route.sacUrl && (
              <BaseButton
                variant="secondary"
                data-testid="trail-sac"
                onClick={() => window.open(route.sacUrl!, '_blank', 'noopener')}
              >
                <BaseIcon name="open_in_new" />
                {t('map.trail.openSac')}
              </BaseButton>
            )}
          </div>
        </>
      ) : (
        <p className={c('no-info')}>{t('map.trail.noInfo')}</p>
      )}
      <p className={c('credit')}>© swisstopo</p>
    </div>
  );

  return isDesktop ? (
    <SideDrawer
      title={title}
      backLabel={fromList ? t('map.trail.backToList') : undefined}
      onClose={onClose}
      onBack={() => selectTrail(null)}
    >
      {body}
    </SideDrawer>
  ) : (
    <BottomSheet
      title={title}
      fitContent
      showBack={fromList}
      onClose={onClose}
      onBack={() => selectTrail(null)}
    >
      {body}
    </BottomSheet>
  );
}
