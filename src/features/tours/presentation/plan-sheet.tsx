import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useLatest } from '@/core/use-latest';
import { ListRow, ListSection, type RowAction } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useFormatter } from '@/core/i18n/format';
import { isOnline } from '@/core/offline/online';
import { legsAlong, lineLength } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import {
  nextStep,
  routeClimb,
  ROUTE_STEPS,
  type PlannedPoint,
  type RoutePoints,
  type RouteStep,
} from '@/features/map/domain/route-plan';
import { initialFollow, type Follow, type SnapNetwork } from '@/features/map/domain/snap-network';
import type { HandleTarget } from '@/features/map/presentation/stores/map-store';
import { FollowSection } from '@/features/map/presentation/follow-section';
import { createLegRouter, isGap, legEnd, tapSnapM } from '@/features/map/presentation/leg-router';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import {
  resultKey,
  resultSubtitle,
  useLocationSearch,
} from '@/features/map/presentation/use-location-search';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';
import { densify, getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import { gpxFromLine } from '@/features/tours/data/services/gpx-writer';
import { isSameGoal } from '@/features/tours/domain/distance';
import {
  estimatedMinutes,
  trackLines,
  type RouteMetrics,
} from '@/features/tours/domain/route-metrics';
import { usePace } from '@/features/user/presentation/stores/user-profile-store';
import { TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type';

import { useTourDraftStore } from './stores/tour-draft-store';
import { profiledMetrics } from './use-route-metrics';

const STEP_ICONS = { start: 'trip_origin', goal: 'flag', end: 'sports_score' } as const;
const at = (p: PlannedPoint): LngLat => [p.location.lng, p.location.lat];

/** Points pulled out of the legs, in order: between start and goal, and between goal and end. */
type Vias = { start: LngLat[]; goal: LngLat[] };
const NO_VIAS: Vias = { start: [], goal: [] };

/**
 * The route's points in order — start, the points between, goal, the points between, end — and
 * the goal's place among them; none before there is a goal. Points between count only while both
 * their ends are set.
 */
function stopsOf(points: RoutePoints, vias: Vias): { stops: LngLat[]; goal: number } | null {
  if (!points.goal) return null;
  const before = points.start ? vias.start : [];
  const after = points.end ? vias.goal : [];
  return {
    stops: [
      ...(points.start ? [at(points.start)] : []),
      ...before,
      at(points.goal),
      ...after,
      ...(points.end ? [at(points.end)] : []),
    ],
    goal: (points.start ? 1 : 0) + before.length,
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
  const { formatElevation, formatDistance, formatDuration } = useFormatter();
  const pace = usePace();
  const draftState = useTourDraftStore.getState();
  const overlays = useMapStore((s) => s.overlays);

  const [points, setPoints] = useState<RoutePoints>(() => initialPoints());
  const [active, setActive] = useState<RouteStep>(() =>
    points.goal ? 'goal' : points.start ? 'goal' : 'start',
  );
  const [follow, setFollow] = useState<Follow>(() =>
    initialFollow(overlays, draftState.draft.tourTypes),
  );
  const [vias, setVias] = useState<Vias>(() => initialVias());
  const following = follow !== 'straight';
  /** A leg's dot picked by a tap: the next map tap sends the route through there. */
  const [pickedLeg, setPickedLeg] = useState<number | null>(null);
  const [legs, setLegs] = useState<Map<string, LngLat[]>>(new Map());
  /** The saved track's legs, by key: they win over routing until a point moves. */
  const [savedLegs, setSavedLegs] = useState<Map<string, LngLat[]>>(new Map());
  const [issue, setIssue] = useState<'unavailable' | null>(null);
  const [finishing, setFinishing] = useState(false);
  const pointsRef = useLatest(points);
  const viasRef = useLatest(vias);
  const moveRef = useLatest(movePoint);
  const pullRef = useLatest(pullLeg);
  const dropRef = useLatest(dropPoint);
  const pickRef = useLatest(pick);
  const tapRef = useLatest(tapMap);
  const pickedLegRef = useLatest(pickedLeg);
  const activeRef = useLatest(active);
  const [lookups] = useState(() => new PointLookups());
  const search = useLocationSearch(active);

  const tourTypes = draftState.draft.tourTypes;
  const network = following ? (follow as SnapNetwork) : null;
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
    // Points between a removed end and the goal go with it.
    if (step === 'start') setVias((v) => ({ ...v, start: [] }));
    if (step === 'end') setVias((v) => ({ ...v, goal: [] }));
    setActive(step);
  }

  /** Where the point at `index` of the route's points sits: a step, or a point between. */
  function pointAt(index: number): { step: RouteStep } | { leg: keyof Vias; i: number } | null {
    const r = stopsOf(pointsRef.current, viasRef.current);
    if (!r) return null;
    const first = pointsRef.current.start ? 1 : 0;
    if (index === r.goal) return { step: 'goal' };
    if (index === 0 && pointsRef.current.start) return { step: 'start' };
    if (index === r.stops.length - 1 && pointsRef.current.end) return { step: 'end' };
    return index < r.goal
      ? { leg: 'start', i: index - first }
      : { leg: 'goal', i: index - r.goal - 1 };
  }

  /** A point dragged: a step is set anew there (named and measured), a point between moved. */
  function movePoint(index: number, to: LngLat) {
    const where = pointAt(index);
    if (!where) return;
    void Haptics.selectionAsync();
    if ('step' in where) {
      place(where.step, { lng: to[0], lat: to[1] });
      return;
    }
    void onWay(to).then((at) =>
      setVias((v) => ({ ...v, [where.leg]: v[where.leg].map((p, i) => (i === where.i ? at : p)) })),
    );
  }

  /** A point between lands on the way nearest the finger, as a drawn point does. */
  async function onWay(to: LngLat): Promise<LngLat> {
    if (!following) return to;
    const radius = tapSnapM(to[1], useMapStore.getState().zoom ?? 13);
    return (await legRouter.resolve(null, to, radius).catch(() => ({ to }))).to;
  }

  /** A leg's middle dragged to `to`: the route goes through there. */
  function pullLeg(leg: number, to: LngLat) {
    const r = stopsOf(pointsRef.current, viasRef.current);
    if (!r) return;
    void Haptics.selectionAsync();
    const first = pointsRef.current.start ? 1 : 0;
    const [part, i] =
      leg < r.goal ? (['start', leg + 1 - first] as const) : (['goal', leg - r.goal] as const);
    void onWay(to).then((at) =>
      setVias((v) => ({ ...v, [part]: [...v[part].slice(0, i), at, ...v[part].slice(i)] })),
    );
  }

  /** A tap on a point or a leg's dot: a step becomes the one the next tap moves, a leg waits. */
  function pick(target: HandleTarget) {
    void Haptics.selectionAsync();
    if ('leg' in target) {
      setPickedLeg((leg) => (leg === target.leg ? null : target.leg));
      return;
    }
    const where = pointAt(target.point);
    setPickedLeg(null);
    if (where && 'step' in where) setActive(where.step);
  }

  /** A map tap: through a picked leg, else the active point set or moved there. */
  function tapMap(location: LngLat) {
    if (pickedLegRef.current !== null) {
      pullLeg(pickedLegRef.current, location);
      setPickedLeg(null);
      return;
    }
    setAndAdvance(activeRef.current, { lng: location[0], lat: location[1] });
  }

  function dropPoint(index: number) {
    const where = pointAt(index);
    if (!where || 'step' in where) return;
    void Haptics.selectionAsync();
    setVias((v) => ({ ...v, [where.leg]: v[where.leg].filter((_, i) => i !== where.i) }));
  }

  // The map's taps set the active point while the step runs.
  useEffect(() => {
    useMapStore.getState().beginStep('route', (location) => tapRef.current(location));
    // A point handed over unnamed (the next day starting at a goal) is looked up like a new one.
    ROUTE_STEPS.forEach((step) => {
      const p = pointsRef.current[step];
      if (p?.loading) place(step, p.location);
    });
    // The map frames the route's points itself (map-screen), as they come and change.
    return () => {
      lookups.abortAll();
      useMapStore.getState().endStep();
    };
    // Once per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A route planned before keeps its shape: its track (waiting in the form, else the saved GPX),
  // cut at the route's points, stands for their legs, a detour pulled out before included.
  useEffect(() => {
    let alive = true;
    void savedLine().then((saved) => {
      const r = stopsOf(pointsRef.current, viasRef.current);
      const cut = saved && r ? legsAlong(saved, r.stops) : null;
      if (!alive || !cut || !r || !network) return;
      const key = (a: LngLat, b: LngLat) => `${network}|${a.join()}|${b.join()}`;
      setSavedLegs(new Map(cut.map((leg, i) => [key(r.stops[i]!, r.stops[i + 1]!), leg])));
    });
    return () => {
      alive = false;
    };
    // Once, for the network the step opens with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Legs along the ways, one at a time, keyed by network and both ends.
  const route = stopsOf(points, vias);
  const pairs = route ? route.stops.slice(1).map((b, i) => [route.stops[i]!, b] as const) : [];
  const keyOf = (a: LngLat, b: LngLat) => `${network ?? 'ways'}|${a.join()}|${b.join()}`;
  const legOf = (a: LngLat, b: LngLat) => savedLegs.get(keyOf(a, b)) ?? legs.get(keyOf(a, b));
  const missing = following ? pairs.filter(([a, b]) => !legOf(a, b)) : [];
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
    following && pairs.length
      ? pairs.flatMap(([a, b], i) => {
          const leg = legOf(a, b) ?? [a, b];
          return i === 0 ? leg : leg.slice(1);
        })
      : null;
  const finding = following && missing.length > 0;
  const gap = following && pairs.some(([a, b]) => isGap(legOf(a, b) ?? []));

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
      // The points are handles to drag (`editHandles`); a leg's middle pulls the route elsewhere.
      // Before there is a goal, a set start or end is a plain marker.
      previewPoints: route
        ? null
        : {
            type: 'FeatureCollection',
            features: (['start', 'end'] as const).flatMap((kind) => {
              const p = points[kind];
              return p
                ? [
                    {
                      type: 'Feature' as const,
                      geometry: { type: 'Point' as const, coordinates: at(p) },
                      properties: { kind, ...(p.name ? { label: p.name } : {}) },
                    },
                  ]
                : [];
            }),
          },
      editHandles: route
        ? {
            points: route.stops.map((p, i) => ({
              at: p,
              kind:
                i === route.goal
                  ? 'goal'
                  : i === 0 && points.start
                    ? 'start'
                    : i === route.stops.length - 1 && points.end
                      ? 'end'
                      : 'via',
            })),
            legs: pairs.map(([a, b]) => (following ? (legOf(a, b) ?? [a, b]) : [a, b])),
            move: (i, to) => moveRef.current(i, to),
            pull: (leg, to) => pullRef.current(leg, to),
            drop: (i) => dropRef.current(i),
            pick: (target) => pickRef.current(target),
            picked:
              pickedLeg !== null
                ? { leg: pickedLeg }
                : points[active]
                  ? { point: activeIndex(route, active) }
                  : null,
          }
        : null,
    });
    // Drawn from what the step holds; the line follows from points and legs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, vias, legs, follow, active, pickedLeg]);

  // Climb and time measured along the line, as the saved tour will show them (route-planner in the
  // PWA). They appear once measured, never first as the points' estimate; that only when the line
  // can't be measured (offline, no profile).
  const lineKey = line ? line.map((p) => p.join(',')).join(';') : '';
  const [profiled, setProfiled] = useState<{ key: string; metrics: RouteMetrics | null } | null>(
    null,
  );
  useEffect(() => {
    if (!line || line.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      void profiledMetrics(line).then((metrics) => {
        if (alive) setProfiled({ key: lineKey, metrics });
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `lineKey` stands for `line`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineKey]);
  const measured = profiled?.key === lineKey ? profiled : null;
  const climb = measured?.metrics ?? (!line || measured || !isOnline() ? routeClimb(points) : null);
  const distance = line ? lineLength(line) : null;
  const minutes = measured?.metrics ? estimatedMinutes(measured.metrics, false, pace) : null;
  const numbers = [
    climb?.ascent ? `↑ ${formatElevation(climb.ascent)}` : null,
    climb?.descent ? `↓ ${formatElevation(climb.descent)}` : null,
    distance ? formatDistance(distance) : null,
    minutes ? formatDuration(minutes) : null,
  ]
    .filter((part): part is string => !!part)
    // A number keeps its unit on its line ("10:31 h"); lines break between numbers.
    .map((part) => part.replace(/ /g, '\u00a0'))
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
          label: t('tours.form.gpxDrawn'),
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

  const followStatus = !following
    ? t('map.plan.follow.straight')
    : finding
      ? t('map.plan.follow.finding')
      : issue === 'unavailable'
        ? t('map.plan.follow.unavailable')
        : gap
          ? t('map.plan.follow.gap')
          : network === 'ski'
            ? t('map.plan.follow.ski')
            : t('map.plan.follow.hiking');

  return (
    <Screen>
      <Page
        title={draftState.mode === 'create' ? t('tours.creation.title') : t('map.plan.editTitle')}
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
                  key={resultKey(result)}
                  title={result.name}
                  subtitle={resultSubtitle(t, result)}
                  icon={result.origin === 'stop' ? 'directions_bus' : 'location_on'}
                  onPress={() => {
                    search.take(result);
                    // The map then frames the route with it (map-screen).
                    setAndAdvance(active, { lng: result.lng, lat: result.lat }, result.name);
                  }}
                />
              ))
            )}
          </ListSection>
        ) : null}

        {numbers ? (
          // The route's climb, distance and time first, in view at the sheet's half height.
          <ListSection>
            <ListRow title={numbers} icon="elevation" accessibilityLabel={numbers} />
          </ListSection>
        ) : null}

        <ListSection
          title={t('map.plan.stepsLabel')}
          footer={[
            pickedLeg !== null ? t('map.plan.hint.pull') : t(`map.plan.hint.${active}`),
            route && route.stops.length > 1 ? t('map.plan.hint.shape') : null,
            vias.start.length + vias.goal.length ? t('map.plan.hint.via') : null,
          ]
            .filter(Boolean)
            .join(' ')}
        >
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
                // Unset, the row is its step ("Ziel", required); set, the place, its step below.
                title={
                  p
                    ? p.loading
                      ? t('common.loading')
                      : (p.name ?? t('map.plan.unnamed'))
                    : t(`map.plan.step.${step}`)
                }
                subtitle={
                  p
                    ? [
                        t(`map.plan.step.${step}`),
                        !p.loading && p.elevation != null ? formatElevation(p.elevation) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : step === 'goal'
                      ? t('map.plan.required')
                      : t('map.plan.optional')
                }
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

        <FollowSection value={follow} onChange={setFollow} status={followStatus} />
      </Page>
    </Screen>
  );
}

/** Where step `step` sits among the route's points. */
function activeIndex(route: { stops: LngLat[]; goal: number }, step: RouteStep): number {
  if (step === 'goal') return route.goal;
  return step === 'start' ? 0 : route.stops.length - 1;
}

/** The tour's track: one waiting in the form, else the saved GPX (unless removed); null without. */
async function savedLine(): Promise<LngLat[] | null> {
  const { track, gpxRemoved, draft, tourId } = useTourDraftStore.getState();
  if (track) return track.line;
  if (gpxRemoved || !draft.gpxFilepath || !tourId) return null;
  const geojson = await loadGpxTrack({ id: tourId, gpxFilepath: draft.gpxFilepath }).catch(
    () => null,
  );
  return geojson ? (trackLines(geojson).flat() as LngLat[]) : null;
}

/** The points between from a route planned before (back from the form), else none. */
function initialVias(): Vias {
  const { route } = useTourDraftStore.getState();
  const track = route?.track;
  if (!track || track.goal == null) return NO_VIAS;
  const first = route.points.start ? 1 : 0;
  const last = route.points.end ? track.points.length - 1 : track.points.length;
  return {
    start: track.points.slice(first, track.goal),
    goal: track.points.slice(track.goal + 1, last),
  };
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
