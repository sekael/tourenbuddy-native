import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { createLogger } from '@/core/logging/logger';
import { connectivity } from '@/core/offline/online';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import {
  findStopsNear,
  type NearbyStop,
} from '@/features/tours/data/services/swisstopo-stop-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import { landsByAir } from '@/features/tours/domain/legs';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './point-suggestions.module.css';

const c = classes(styles);
const log = createLogger('point-suggestions');
const MAX = 3;
/** "Your earlier tour to this goal": goals this close are the same objective. */
const SAME_GOAL_M = 300;
/** A suggestion this close to `exclude` is the same place. */
const SAME_PLACE_M = 100;
/** A stop this close to the goal is no start: the tour would have no way up. */
const AT_GOAL_M = 500;

type LngLat = { lng: number; lat: number };
type Suggestion = { kind: 'history' | 'stop'; name: string; location: LngLat; distance?: number };

/**
 * One-tap start or end points near the goal: where the user's own earlier tour to this goal
 * started (ended), then the nearest public-transport stops. Shows nothing until something is known.
 */
export function PointSuggestions({
  role,
  around,
  exclude,
  tourId,
  landing,
  onPick,
}: {
  role: 'start' | 'end';
  around: LngLat;
  exclude?: LngLat | null;
  tourId?: string;
  /** The end is a landing: only earlier landings (the stops around a summit are no landing field). */
  landing?: boolean;
  onPick: (pick: { location: LngLat; name: string }) => void;
}) {
  const { t } = useTranslation('web');
  const { formatDistance } = useFormatter();
  const tours = useToursStore((s) => s.tours);
  const online = useStore(connectivity, (s) => s.online);
  const [stops, setStops] = useState<NearbyStop[]>([]);
  const isExcluded = (p: LngLat) => !!exclude && isSameGoal(p, exclude, SAME_PLACE_M);

  const seen = new Set<string>();
  const history: Suggestion[] = tours
    .filter(
      (tour) =>
        tour.id !== tourId &&
        isSameGoal(tour.goal, around, SAME_GOAL_M) &&
        (!landing || landsByAir(tour)),
    )
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .flatMap((tour) => {
      const [point, name] =
        role === 'start'
          ? [tour.startPoint, tour.startPointName]
          : [tour.endPoint, tour.endPointName];
      if (!point || !name || seen.has(name) || isExcluded(point)) return [];
      seen.add(name);
      return [{ kind: 'history' as const, name, location: point }];
    })
    .slice(0, 1);

  useEffect(() => {
    setStops([]);
    if (!online || landing) return;
    const controller = new AbortController();
    findStopsNear(around, controller.signal).then(
      (found) => !controller.signal.aborted && setStops(found),
      (err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError'))
          log.warn('Stop suggestions unavailable', err);
      },
    );
    return () => controller.abort();
  }, [around.lng, around.lat, online, landing]);

  const names = new Set(history.map((s) => s.name));
  const near: Suggestion[] = stops
    .filter(
      (stop) =>
        !names.has(stop.name) &&
        !isExcluded(stop) &&
        (role === 'end' || stop.distance >= AT_GOAL_M),
    )
    .map((stop) => ({
      kind: 'stop',
      name: stop.name,
      location: { lng: stop.lng, lat: stop.lat },
      distance: stop.distance,
    }));
  const suggestions = [...history, ...near].slice(0, MAX);
  if (suggestions.length === 0) return null;
  return (
    <div className={c('suggestions')} data-testid={`${role}-suggestions`}>
      <span className={c('label')}>{t('tours.form.suggestions.label')}</span>
      {suggestions.map((s) => (
        <button
          key={`${s.kind}:${s.name}`}
          type="button"
          className={c('suggestion')}
          aria-label={
            s.kind === 'history'
              ? t('tours.form.suggestions.history', { name: s.name })
              : t('tours.form.suggestions.stop', { name: s.name })
          }
          data-testid="point-suggestion"
          onClick={() => onPick({ location: s.location, name: s.name })}
        >
          <BaseIcon
            name={s.kind === 'history' ? 'history' : 'directions_bus'}
            size="sm"
            className={c('icon')}
          />
          <span className={c('name')}>{s.name}</span>
          {s.distance != null && <span className={c('meta')}>{formatDistance(s.distance)}</span>}
        </button>
      ))}
    </div>
  );
}
