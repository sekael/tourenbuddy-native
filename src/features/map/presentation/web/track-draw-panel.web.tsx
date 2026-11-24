import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { PaceBadge } from '@/core/web/pace-badge.web';
import { useElementSize } from '@/core/web/use-element-size.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import {
  formatPace,
  PACE_MAX,
  PACE_MIN,
  PACE_STEP,
  setPace,
  usePace,
} from '@/core/web/use-pace.web';
import { useSheetInset } from '@/core/web/use-sheet-inset.web';
import { TRAIL_OVERLAYS, type TrailOverlayId } from '@/features/map/data/trail-overlays';
import type { SnapNetwork } from '@/features/map/domain/snap-network';
import type { Share } from '@/features/map/domain/track-bands';
import type { ProfiledLine } from '@/features/tours/data/services/swisstopo-profile-service';
import type { RouteMetrics } from '@/features/tours/domain/route-metrics';

import { ElevationProfile } from './elevation-profile.web';
import styles from './track-draw-panel.module.css';
import type { NetworkIssue } from './use-track-drawing.web';

const c = classes(styles);

/**
 * The drawing's panel, laid out like the swisstopo app's: what the line follows first (the map's
 * trail layers, switchable right here) beside the close button, the numbers — distance, time,
 * climb, descent — the elevation profile, and undo / redo / back to start beside Done. Every row
 * keeps its height from the first tap on, so the panel never jumps as the numbers arrive. The
 * time opens the pace, tortoise to hare, in the status line's place.
 */
export function TrackDrawPanel(props: {
  overlays: readonly TrailOverlayId[];
  network: SnapNetwork | null;
  /** Both layers are shown, so the activity decided what the line follows. */
  byActivity: boolean;
  issue: NetworkIssue;
  /** A leg found no way and goes straight. */
  gap?: boolean;
  points: number;
  metrics: RouteMetrics;
  minutes: number | null;
  profile: ProfiledLine | null;
  /** The profile's colours along it: the route's activities, way by way. */
  profileBands: readonly Share[];
  busy: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The line already ends at its start: nothing to return. */
  closed: boolean;
  onToggleOverlay: (id: TrailOverlayId) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReturnToStart: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('web');
  const { formatElevation, formatDistance, formatDuration } = useFormatter();
  const online = useStore(connectivity, (st) => st.online);
  const pace = usePace();
  const { issue, gap, network, points, metrics } = props;

  const status =
    issue === 'unavailable'
      ? t('map.draw.status.unavailable')
      : gap
        ? t('map.plan.follow.gap')
        : !network
          ? t('map.draw.status.ways')
          : props.byActivity
            ? `${t(`map.draw.status.${network}`)} ${t('map.draw.status.byActivity')}`
            : t(`map.draw.status.${network}`);

  const hint =
    points === 0
      ? t('map.draw.hint.start')
      : points === 1
        ? t('map.draw.hint.next')
        : online
          ? t('map.draw.hint.profileLoading')
          : t('map.draw.hint.profileOffline');

  const duration = props.minutes == null ? '–' : formatDuration(props.minutes);
  const [paceOpen, setPaceOpen] = useState(false);

  // On a phone the panel is a bottom sheet: bottom toasts (`--sheet-inset`) rise above its buttons.
  // Docked left on desktop, it leaves the centred toasts clear.
  const panel = useRef<HTMLElement>(null);
  const { height } = useElementSize(panel, { box: 'border-box' });
  const isDesktop = useIsDesktop();
  const publishInset = useSheetInset();
  useEffect(() => void publishInset(isDesktop ? 0 : height), [isDesktop, height]);

  return (
    <section
      ref={panel}
      className={c('draw-panel')}
      aria-label={t('map.draw.title')}
      data-testid="track-draw-panel"
    >
      <div className={c('snap')} role="group" aria-label={t('map.draw.followLabel')}>
        {TRAIL_OVERLAYS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={c('chip', {
              'chip--on': props.overlays.includes(o.id),
              'chip--snapping': network === o.id,
            })}
            aria-pressed={props.overlays.includes(o.id)}
            onClick={() => props.onToggleOverlay(o.id)}
          >
            <BaseIcon name={o.icon} size="sm" />
            {t(o.labelKey as never)}
          </button>
        ))}
        <span className={c('spacer')} />
        <BaseIconButton
          name="close"
          variant="tonal"
          label={t('tours.picker.cancelBtn')}
          data-testid="draw-cancel"
          onClick={props.onCancel}
        />
      </div>
      {/* The pace takes the status line's place while open: the panel keeps its height, the map its track. */}
      {!paceOpen ? (
        <p className={c('status', { 'status--warn': !!issue || !!gap })} role="status">
          {status}
        </p>
      ) : (
        <div id="draw-pace" className={c('pace')} data-testid="draw-pace">
          <label htmlFor="draw-pace-input" className={c('pace-label')}>
            {t('tours.route.pace')}
          </label>
          <BaseIcon name="snail" />
          <input
            id="draw-pace-input"
            value={pace}
            onChange={(e) => setPace(Number(e.target.value))}
            type="range"
            min={PACE_MIN}
            max={PACE_MAX}
            step={PACE_STEP}
            aria-valuetext={formatPace(pace)}
          />
          <BaseIcon name="cruelty_free" />
          <output htmlFor="draw-pace-input" className={c('pace-value')}>
            {formatPace(pace)}
          </output>
        </div>
      )}

      <dl className={c('stats', { 'stats--empty': points < 2 })}>
        <div>
          <dt className={c('visually-hidden')}>{t('tours.route.distance')}</dt>
          <dd>{formatDistance(metrics.distance ?? 0)}</dd>
        </div>
        <div>
          <dt className={c('visually-hidden')}>{t('tours.route.time')}</dt>
          <dd>
            <button
              type="button"
              className={c('pace-toggle')}
              aria-expanded={paceOpen}
              aria-controls="draw-pace"
              title={t('map.draw.pace.open')}
              data-testid="draw-pace-toggle"
              onClick={() => setPaceOpen(!paceOpen)}
            >
              {duration}
              {/* One width for either: the figures never move as the pace leaves 1.0. */}
              <span className={c('pace-slot')}>
                {!paceOpen && pace !== 1 ? <PaceBadge /> : <BaseIcon name="speed" size="sm" />}
              </span>
              <span className={c('visually-hidden')}>
                {t('map.draw.pace.open')} ({formatPace(pace)})
              </span>
            </button>
          </dd>
        </div>
        <div>
          <dt>
            <span aria-hidden="true">↗</span>
            <span className={c('visually-hidden')}>{t('tours.route.ascent')}</span>
          </dt>
          <dd>{metrics.ascent == null ? '–' : formatElevation(metrics.ascent)}</dd>
        </div>
        <div>
          <dt>
            <span aria-hidden="true">↘</span>
            <span className={c('visually-hidden')}>{t('tours.route.descent')}</span>
          </dt>
          <dd>{metrics.descent == null ? '–' : formatElevation(metrics.descent)}</dd>
        </div>
      </dl>

      {props.profile && points >= 2 ? (
        <ElevationProfile
          line={props.profile.line}
          heights={props.profile.heights}
          bands={props.profileBands}
        />
      ) : (
        <p className={c('profile-hint')}>{hint}</p>
      )}

      <div className={c('actions')}>
        <BaseIconButton
          name="undo"
          size="lg"
          variant="tonal"
          label={t('map.draw.undo')}
          disabled={!props.canUndo}
          data-testid="draw-undo"
          onClick={props.onUndo}
        />
        <BaseIconButton
          name="redo"
          size="lg"
          variant="tonal"
          label={t('map.draw.redo')}
          disabled={!props.canRedo}
          data-testid="draw-redo"
          onClick={props.onRedo}
        />
        <BaseButton
          variant="secondary"
          className={c('return')}
          disabled={points < 2 || props.closed || props.busy}
          title={t('map.draw.returnToStartHint')}
          data-testid="draw-return"
          onClick={props.onReturnToStart}
        >
          <BaseIcon name="u_turn_left" />
          {t('map.draw.returnToStart')}
        </BaseButton>
        <span className={c('spacer')} />
        <BaseButton
          variant="primary"
          disabled={points < 2 || props.busy}
          data-testid="draw-done"
          onClick={props.onDone}
        >
          {t('map.draw.done')}
        </BaseButton>
      </div>
    </section>
  );
}
