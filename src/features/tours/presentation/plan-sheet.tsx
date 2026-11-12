import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useLatest } from '@/core/use-latest';
import { ListRow, ListSection, ToggleRow, type RowAction } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useFormatter } from '@/core/i18n/format';
import { isOnline } from '@/core/offline/online';
import { lineLength } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import {
  nextStep,
  routeClimb,
  ROUTE_STEPS,
  type PlannedPoint,
  type RoutePoints,
  type RouteStep,
} from '@/features/map/domain/route-plan';
import { snapNetworkFor } from '@/features/map/domain/snap-network';
import { createLegRouter, isGap, legEnd } from '@/features/map/presentation/leg-router';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import { useLocationSearch } from '@/features/map/presentation/use-location-search';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';
import { densify, getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';
import { gpxFromLine } from '@/features/tours/data/services/gpx-writer';
import { isSameGoal } from '@/features/tours/domain/distance';
import { TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type';

import { useTourDraftStore } from './stores/tour-draft-store';

const STEP_ICONS = { start: 'trip_origin', goal: 'flag', end: 'sports_score' } as const;
const at = (p: PlannedPoint): LngLat => [p.location.lng, p.location.lat];

/** The route's stops in order and the goal's place among them; none before there is a goal. */
function stopsOf(points: RoutePoints): { stops: LngLat[]; goal: number } | null {
  if (!points.goal) return null;
  return {
    stops: [points.start, points.goal, points.end].filter((p) => p !== null).map(at),
    goal: points.start ? 1 : 0,
  };
}

/** One name-and-height lookup per point: a new one for a point aborts the one before. */
class PointLookups {
  private live: Partial<Record<RouteStep, AbortController>> = {};

  start(step: RouteStep) {
    this.live[step]?.abort();
    const controller = new AbortController();
    this.live[step] = controller;
    return controller;
  }

  isCurrent(step: RouteStep, controller: AbortController) {
    return this.live[step] === controller;
  }

  abort(step: RouteStep) {
    this.live[step]?.abort();
    delete this.live[step];
  }

  abortAll() {
    ROUTE_STEPS.forEach((step) => this.abort(step));
  }
}

/**
 * The route step (tour-creation-flow, D4): over the live map, in a small sheet that leaves the map
 * free above it. Start → goal → end are set in order by a tap on the map or a search result, each
 * named and measured at once; a row makes its point the one the next tap moves. The legs follow the
 * shown trails (or go straight), and that line becomes the tour's track. Continue opens the form
 * (or, coming from it, Done returns to it) with every point and the track.
 */
export function PlanSheet({ back }: { back: boolean }) {
  const { t } = useTranslation();
  const { formatElevation, formatDistance } = useFormatter();
  const draftState = useTourDraftStore.getState();
  const overlays = useMapStore((s) => s.overlays);

  const [points, setPoints] = useState<RoutePoints>(() => initialPoints());
  const [active, setActive] = useState<RouteStep>(() =>
    points.goal ? 'goal' : points.start ? 'goal' : 'start',
  );
  const [follow, setFollow] = useState(true);
  const [legs, setLegs] = useState<Map<string, LngLat[]>>(new Map());
  const [issue, setIssue] = useState<'unavailable' | null>(null);
  const [finishing, setFinishing] = useState(false);
  const pointsRef = useLatest(points);
  const activeRef = useLatest(active);
  const [lookups] = useState(() => new PointLookups());
  const search = useLocationSearch(active);

  const tourTypes = draftState.draft.tourTypes;
  const network = snapNetworkFor(overlays, tourTypes);
  const legRouter = useMemo(
    () => createLegRouter({ network: () => network, maxTiles: 64 }),
    [network],
  );

  /** A set point is named (unless a search named it) and measured at once. */
  function place(step: RouteStep, location: { lng: number; lat: number }, name?: string) {
    const own = lookups.start(step);
    const point: PlannedPoint = { location, name: name ?? null, elevation: null, loading: true };
    setPoints((p) => ({ ...p, [step]: point }));
    void Promise.all([
      name ?? suggestTourName(location, own.signal).catch(() => null),
      getElevation(location, own.signal).catch(() => null),
    ]).then(([found, height]) => {
      if (!lookups.isCurrent(step, own)) return;
      setPoints((p) => ({
        ...p,
        [step]: { ...point, name: found ?? null, elevation: height, loading: false },
      }));
    });
  }

  function setAndAdvance(step: RouteStep, location: { lng: number; lat: number }, name?: string) {
    place(step, location, name);
    const next = { ...pointsRef.current, [step]: { location } as PlannedPoint };
    setActive(nextStep(next, step));
    void Haptics.selectionAsync();
  }

  function clear(step: RouteStep) {
    lookups.abort(step);
    setPoints((p) => ({ ...p, [step]: null }));
    setActive(step);
  }

  // The map's taps set the active point while the step runs.
  useEffect(() => {
    useMapStore
      .getState()
      .beginStep('route', ([lng, lat]) => setAndAdvance(activeRef.current, { lng, lat }));
    // A point handed over unnamed (the next day starting at a goal) is looked up like a new one.
    ROUTE_STEPS.forEach((step) => {
      const p = pointsRef.current[step];
      if (p?.loading) place(step, p.location);
    });
    const framed = ROUTE_STEPS.flatMap((s) =>
      pointsRef.current[s] ? [at(pointsRef.current[s]!)] : [],
    );
    if (framed.length > 1) {
      const lngs = framed.map((p) => p[0]);
      const lats = framed.map((p) => p[1]);
      useMapStore.getState().requestCamera({
        kind: 'fit',
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
      });
    } else if (framed.length === 1) {
      useMapStore.getState().requestCamera({ kind: 'fly', center: framed[0]!, zoom: 14 });
    }
    return () => {
      lookups.abortAll();
      useMapStore.getState().endStep();
    };
    // Once per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Legs along the ways, one at a time, keyed by network and both ends.
  const route = stopsOf(points);
  const pairs = route ? route.stops.slice(1).map((b, i) => [route.stops[i]!, b] as const) : [];
  const keyOf = (a: LngLat, b: LngLat) => `${network ?? 'ways'}|${a.join()}|${b.join()}`;
  const missing = follow ? pairs.filter(([a, b]) => !legs.has(keyOf(a, b))) : [];
  const missingKey = missing.map(([a, b]) => keyOf(a, b)).join(';');
  useEffect(() => {
    if (!missing.length || !route) return;
    let alive = true;
    void (async () => {
      for (const [a, b] of missing) {
        const i = route.stops.indexOf(a);
        const leg = await legRouter
          .between(a, b, [
            legEnd(i, route.stops.length, route.goal),
            legEnd(i + 1, route.stops.length, route.goal),
          ])
          .catch(() => [a, b]);
        if (!alive) return;
        setIssue(legRouter.issue());
        setLegs((m) => new Map(m).set(keyOf(a, b), leg));
      }
    })();
    return () => {
      alive = false;
    };
    // `missingKey` stands for `missing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, legRouter]);

  const line: LngLat[] | null =
    follow && pairs.length
      ? pairs.flatMap(([a, b], i) => {
          const leg = legs.get(keyOf(a, b)) ?? [a, b];
          return i === 0 ? leg : leg.slice(1);
        })
      : null;
  const finding = follow && missing.length > 0;
  const gap = follow && pairs.some(([a, b]) => isGap(legs.get(keyOf(a, b)) ?? []));

  // What the map draws: the line (or straight dashes) and the points.
  useEffect(() => {
    const color = tourTypes[0] ? TOUR_TYPE_TRACK_COLORS[tourTypes[0]] : '#334155';
    const straight = route && route.stops.length > 1 ? route.stops : null;
    useMapStore.setState({
      previewLines: {
        type: 'FeatureCollection',
        features:
          line || straight
            ? [
                {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: line ?? straight! },
                  properties: line
                    ? { color, width: 4, casing: true }
                    : { color, width: 3, dashed: true },
                },
              ]
            : [],
      },
      previewPoints: {
        type: 'FeatureCollection',
        features: ROUTE_STEPS.flatMap((step) => {
          const p = points[step];
          if (!p) return [];
          const kind = step === 'goal' ? 'preview' : step;
          return [
            {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: at(p) },
              properties: { kind, ...(p.name ? { label: p.name } : {}) } as {
                kind: 'start' | 'end' | 'preview';
                label?: string;
              },
            },
          ];
        }),
      },
    });
    // Drawn from what the step holds; the line follows from points and legs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, legs, follow]);

  const climb = routeClimb(points);
  const distance = line ? lineLength(line) : null;
  const numbers = [
    climb?.ascent ? `↑ ${formatElevation(climb.ascent)}` : null,
    climb?.descent ? `↓ ${formatElevation(climb.descent)}` : null,
    distance ? formatDistance(distance) : null,
  ]
    .filter(Boolean)
    .join('  ');

  const waiting = ROUTE_STEPS.some((s) => points[s]?.loading);
  const roundTripSet =
    !!points.start && !!points.end && isSameGoal(points.start.location, points.end.location, 1);

  function cancel() {
    if (back) {
      router.replace('/tour/edit');
      return;
    }
    if (!ROUTE_STEPS.some((s) => points[s])) {
      useTourDraftStore.getState().reset();
      router.back();
      return;
    }
    Alert.alert(t('tours.creation.discard'), undefined, [
      { text: t('tours.creation.keepEditing'), style: 'cancel' },
      {
        text: t('contacts.shared.discardBtn'),
        style: 'destructive',
        onPress: () => {
          useTourDraftStore.getState().reset();
          router.back();
        },
      },
    ]);
  }

  async function finish() {
    if (!points.goal) return;
    setFinishing(true);
    const store = useTourDraftStore.getState();
    try {
      const track = line && route ? { points: route.stops, legs: [], goal: route.goal } : null;
      store.setRoute({ points, track });
      if (line && line.length > 1) {
        // The line becomes the tour's GPX, with the terrain's heights when online.
        const profiled = isOnline() ? await getTrackProfile(line).catch(() => null) : null;
        const name = store.draft.name?.trim() || points.goal.name || t('tours.form.gpxDrawn');
        store.setTrack({
          text: gpxFromLine(profiled?.line ?? densify(line), profiled?.heights ?? null, name),
          label: t('tours.form.gpxDrawnFile', { distance: formatDistance(lineLength(line)) }),
          line,
          drawing: track,
        });
      } else if (store.track?.drawing) {
        // A route gone straight takes a planned track away; an uploaded file stays.
        store.setTrack(null);
      }
      router.replace('/tour/edit');
    } finally {
      setFinishing(false);
    }
  }

  const followStatus = !follow
    ? t('map.plan.follow.straight')
    : finding
      ? t('map.plan.follow.finding')
      : issue === 'unavailable'
        ? t('map.plan.follow.unavailable')
        : gap
          ? t('map.plan.follow.gap')
          : network === 'ski'
            ? t('map.plan.follow.ski')
            : network === 'hiking'
              ? t('map.plan.follow.hiking')
              : t('map.plan.follow.ways');

  return (
    <Screen>
      <Page
        title={t('tours.creation.title')}
        cancel={{ label: back ? t('common.back') : t('common.cancel'), onPress: cancel }}
        confirm={{
          label: back ? t('map.plan.done') : t('map.plan.continue'),
          onPress: () => void finish(),
          disabled: !points.goal || waiting || finishing,
        }}
        search={{
          value: search.query,
          onChange: search.setQuery,
          prompt:
            active === 'goal'
              ? t('tours.picker.search.placeholder')
              : t('tours.picker.search.placeholderAccess'),
        }}
      >
        {search.results.length > 0 || search.failed ? (
          <ListSection title={t('tours.picker.search.label')}>
            {search.failed ? (
              <ListRow title={t('tours.picker.search.error')} icon="warning" />
            ) : (
              search.results.slice(0, 8).map((result) => (
                <ListRow
                  key={`${result.origin}-${result.lng}-${result.lat}`}
                  title={result.name}
                  subtitle={[
                    result.kind ??
                      t(
                        `tours.picker.search.origin.${result.origin}` as 'tours.picker.search.origin.gazetteer',
                      ),
                    result.region,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  icon={result.origin === 'stop' ? 'directions_bus' : 'location_on'}
                  onPress={() => {
                    search.take(result);
                    setAndAdvance(active, { lng: result.lng, lat: result.lat }, result.name);
                    useMapStore.getState().requestCamera({
                      kind: 'fly',
                      center: [result.lng, result.lat],
                      zoom: Math.max(result.zoom ?? 13, 13),
                    });
                  }}
                />
              ))
            )}
          </ListSection>
        ) : null}

        <ListSection title={t('map.plan.stepsLabel')} footer={t(`map.plan.hint.${active}`)}>
          {ROUTE_STEPS.map((step) => {
            const p = points[step];
            const actions: RowAction[] =
              step !== 'goal' && p
                ? [
                    {
                      label: t('map.plan.removeStep', { step: t(`map.plan.step.${step}`) }),
                      icon: 'close',
                      destructive: true,
                      onPress: () => clear(step),
                    },
                  ]
                : [];
            return (
              <ListRow
                key={step}
                title={
                  p
                    ? p.loading
                      ? t('common.loading')
                      : (p.name ?? t('map.plan.unnamed'))
                    : step === 'goal'
                      ? t('map.plan.required')
                      : t('map.plan.optional')
                }
                subtitle={[
                  t(`map.plan.step.${step}`),
                  p && !p.loading && p.elevation != null ? formatElevation(p.elevation) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                icon={step === 'end' && roundTripSet ? 'u_turn_left' : STEP_ICONS[step]}
                iconColor={active === step ? undefined : '#94a3b8'}
                checked={active === step}
                chevron={false}
                onPress={() => setActive(step)}
                swipeActions={actions.length ? actions : undefined}
                contextActions={actions.length ? actions : undefined}
                accessibilityLabel={`${t(`map.plan.step.${step}`)}: ${p?.name ?? (step === 'goal' ? t('map.plan.required') : t('map.plan.optional'))}`}
              />
            );
          })}
          {points.start && !points.end ? (
            <ListRow
              title={t('map.plan.roundTrip')}
              icon="u_turn_left"
              onPress={() => {
                const start = points.start!;
                lookups.abort('end');
                setPoints((p) => ({ ...p, end: { ...start, location: { ...start.location } } }));
              }}
            />
          ) : null}
          {active === 'start' && !points.start ? (
            <ListRow
              title={t('map.plan.skip')}
              icon="arrow_forward"
              onPress={() => setActive(nextStep(points, 'start'))}
            />
          ) : null}
        </ListSection>

        <ListSection footer={followStatus}>
          <ToggleRow
            title={t('map.plan.follow.label')}
            icon="route"
            value={follow}
            onValueChange={setFollow}
          />
          {numbers ? (
            <ListRow title={numbers} icon="elevation" accessibilityLabel={numbers} />
          ) : null}
        </ListSection>
      </Page>
    </Screen>
  );
}

/** The points to start from: the draft's (from the form), else none. */
function initialPoints(): RoutePoints {
  const { draft, goal, route } = useTourDraftStore.getState();
  if (route) return route.points;
  const planned = (
    location: { lng: number; lat: number } | null,
    name: string | null,
    elevation: number | null,
  ): PlannedPoint | null => (location ? { location, name, elevation, loading: false } : null);
  return {
    start: planned(draft.startPoint, draft.startPointName, draft.startPointElevation),
    goal: planned(goal, draft.name, draft.elevation),
    end: planned(draft.endPoint, draft.endPointName, draft.endPointElevation),
  };
}
