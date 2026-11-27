import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useLatest } from '@/core/use-latest';
import { ListRow, ListSection, type RowAction } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useFormatter } from '@/core/i18n/format';
import { isOnline } from '@/core/offline/online';
import { legsAlong, lineLength } from '@/features/map/domain/drawn-track';
import { NO_TYPE_COLOR, routeBands } from '@/features/map/domain/track-bands';
import type { LngLat } from '@/features/map/domain/entities/trail';
import {
  nextStep,
  routeClimb,
  ROUTE_STEPS,
  type PlannedPoint,
  type RoutePoints,
  type RouteStep,
} from '@/features/map/domain/route-plan';
import { wayFollow, type Follow, type Way } from '@/features/map/domain/snap-network';
import type { HandleTarget } from '@/features/map/presentation/stores/map-store';
import { EditActions } from '@/features/map/presentation/edit-actions';
import { FollowSection, followStatus } from '@/features/map/presentation/follow-section';
import { openTour } from '@/features/map/presentation/open-tour';
import { isGap, legEnd, legRouters, tapSnapM } from '@/features/map/presentation/leg-router';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import {
  resultKey,
  resultSubtitle,
  useLocationSearch,
} from '@/features/map/presentation/use-location-search';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import { landsByAir } from '@/features/tours/domain/legs';
import { tourMinutes, type RouteMetrics } from '@/features/tours/domain/route-metrics';
import { usePace } from '@/features/user/presentation/stores/user-profile-store';
import { TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type';

import { DayPills, useDayLabel } from './day-pills';
import { useTourDraftStore } from './stores/tour-draft-store';
import { FLOWN_NOTE_M, gpxOf, savedLine } from './replan-track';
import { useHistory } from './use-history';
import { profiledMetrics } from './use-route-metrics';

const STEP_ICONS = { start: 'trip_origin', goal: 'flag', end: 'sports_score' } as const;
const at = (p: PlannedPoint): LngLat => [p.location.lng, p.location.lat];
/** A leg's key: what it follows and both its ends. */
const keyOf = (follow: Follow, a: LngLat, b: LngLat) => `${follow}|${a.join()}|${b.join()}`;

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
  // A trip's days (tour-outings "Days in the route step"): this sheet plans the one on screen.
  const days = Math.max(1, draftState.stages.length);
  const day = draftState.active;
  const dayLabel = useDayLabel();

  const [placed, setPoints] = useState<RoutePoints>(() => initialPoints());
  /**
   * «Rundtour»: the end is the start and the way back the way up reversed, its points and legs, as
   * the way up is shaped. An end of its own, or the start or end removed, ends it.
   */
  const [backSame, setBackSame] = useState(() => !!useTourDraftStore.getState().route?.backSame);
  const points: RoutePoints = backSame && placed.start ? { ...placed, end: placed.start } : placed;
  const [active, setActive] = useState<RouteStep>(() =>
    points.goal ? 'goal' : points.start ? 'goal' : 'start',
  );
  /** The legs follow the ways (the PWA's switch); off, straight lines between the points. */
  const [following, setFollowing] = useState(true);
  /** The end is back at the start: its row says so, and the map marks the place once. */
  const roundTripSet =
    !!points.start && !!points.end && isSameGoal(points.start.location, points.end.location, 1);
  const [drawnVias, setVias] = useState<Vias>(() => initialVias());
  const vias: Vias = backSame ? { ...drawnVias, goal: [...drawnVias.start].reverse() } : drawnVias;
  /** A leg's dot selected by a tap: dragged, or the next map tap sends the route through there. */
  const [pickedLeg, setPickedLeg] = useState<number | null>(null);
  /** A point between selected by a tap (its place among the route's points): dragged, or moved to
   * the next map tap; the bin takes it out. A start, goal or end is selected as the active row. */
  const [pickedVia, setPickedVia] = useState<number | null>(null);
  /** Points between still finding their way (a move or pull): undo waits for them. */
  const [settling, setSettling] = useState(0);
  const [legs, setLegs] = useState<Map<string, LngLat[]>>(new Map());
  /** The saved track's legs, by key: they win over routing until a point moves. */
  const [savedLegs, setSavedLegs] = useState<Map<string, LngLat[]>>(new Map());
  /** The saved track is known: until then no leg routes or shows straight in its place. */
  const [opened, setOpened] = useState(false);
  const [issue, setIssue] = useState<'unavailable' | null>(null);
  const [finishing, setFinishing] = useState(false);
  const pointsRef = useLatest(points);
  const viasRef = useLatest(vias);
  const moveRef = useLatest(movePoint);
  const pullRef = useLatest(pullLeg);
  const pickRef = useLatest(pick);
  const tapRef = useLatest(tapMap);
  const pickedLegRef = useLatest(pickedLeg);
  const pickedViaRef = useLatest(pickedVia);
  const placedRef = useLatest(placed);
  const drawnViasRef = useLatest(drawnVias);
  const backSameRef = useLatest(backSame);
  const activeRef = useLatest(active);
  const [lookups] = useState(() => new PointLookups());
  const search = useLocationSearch(active);
  // Every change to the route's points can be undone (owner, 2026-11-26); its legs follow.
  const history = useHistory(
    () => ({
      placed: placedRef.current,
      vias: drawnViasRef.current,
      backSame: backSameRef.current,
    }),
    (state) => {
      lookups.abortAll();
      setPoints(state.placed);
      setVias(state.vias);
      setBackSame(state.backSame);
      setPickedLeg(null);
      setPickedVia(null);
      // A point brought back while it was still being named is named again.
      ROUTE_STEPS.forEach((step) => {
        const p = state.placed[step];
        if (p?.loading) place(step, p.location, p.name ?? undefined);
      });
    },
  );

  /** A point between finding its way: undo and redo wait until it has. */
  function settle(work: Promise<void>) {
    setSettling((n) => n + 1);
    void work.finally(() => setSettling((n) => n - 1));
  }

  const tourTypes = draftState.draft.tourTypes;
  /** What each way follows: its own activities' network, a flown way straight (activity-legs). */
  const ways: Record<Way, Follow> = {
    up: following ? wayFollow(overlays, draftState.draft, 'up') : 'straight',
    down: following ? wayFollow(overlays, draftState.draft, 'down') : 'straight',
  };
  const [routerFor] = useState(() => legRouters(64));
  /** The way down ends in a flight: the end is the landing (activity-legs, as the PWA's form). */
  const landing = landsByAir(draftState.draft);

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
    history.record();
    // An end of its own: the way back goes its own way.
    if (step === 'end') setBackSame(false);
    place(step, location, name);
    const next = { ...pointsRef.current, [step]: { location } as PlannedPoint };
    setActive(nextStep(next, step));
    void Haptics.selectionAsync();
  }

  function clear(step: RouteStep) {
    history.record();
    if (step !== 'goal') setBackSame(false);
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
    history.record();
    void Haptics.selectionAsync();
    if ('step' in where) {
      place(where.step, { lng: to[0], lat: to[1] });
      return;
    }
    settle(
      onWay(to, where.leg === 'start' ? 'up' : 'down').then((at) =>
        setVias((v) => ({
          ...v,
          [where.leg]: v[where.leg].map((p, i) => (i === where.i ? at : p)),
        })),
      ),
    );
  }

  /** A point between lands on the way nearest the finger, as a drawn point does (flown: where set). */
  async function onWay(to: LngLat, way: Way): Promise<LngLat> {
    if (ways[way] === 'straight') return to;
    const radius = tapSnapM(to[1], useMapStore.getState().zoom ?? 13);
    return (
      await routerFor(ways[way])
        .resolve(null, to, radius)
        .catch(() => ({ to }))
    ).to;
  }

  /** A leg's middle dragged to `to`: the route goes through there. */
  function pullLeg(leg: number, to: LngLat) {
    const r = stopsOf(pointsRef.current, viasRef.current);
    if (!r) return;
    history.record();
    void Haptics.selectionAsync();
    // The leg is two now: its dot, and any point selected after it, sit elsewhere.
    setPickedLeg(null);
    setPickedVia(null);
    const first = pointsRef.current.start ? 1 : 0;
    const [part, i] =
      leg < r.goal ? (['start', leg + 1 - first] as const) : (['goal', leg - r.goal] as const);
    settle(
      onWay(to, part === 'start' ? 'up' : 'down').then((at) => {
        setVias((v) => ({ ...v, [part]: [...v[part].slice(0, i), at, ...v[part].slice(i)] }));
        // The new point is selected: it drags on, or the bin takes it out again.
        setPickedVia(leg + 1);
      }),
    );
  }

  /**
   * A tap on a point or a leg's dot selects it (owner, 2026-11-26: a tap never removes): a start,
   * goal or end becomes the active point, a point between or a leg's dot is selected, and a tap on
   * the selected one lets it go.
   */
  function pick(target: HandleTarget) {
    void Haptics.selectionAsync();
    if ('leg' in target) {
      setPickedVia(null);
      setPickedLeg((leg) => (leg === target.leg ? null : target.leg));
      return;
    }
    const where = pointAt(target.point);
    setPickedLeg(null);
    if (!where) return;
    if ('step' in where) {
      setPickedVia(null);
      setActive(where.step);
    } else setPickedVia((i) => (i === target.point ? null : target.point));
  }

  /** A map tap: through a selected leg, to a selected point between, else the active point there. */
  function tapMap(location: LngLat) {
    if (pickedLegRef.current !== null) {
      pullLeg(pickedLegRef.current, location);
      return;
    }
    if (pickedViaRef.current !== null) {
      movePoint(pickedViaRef.current, location);
      setPickedVia(null);
      return;
    }
    setAndAdvance(activeRef.current, { lng: location[0], lat: location[1] });
  }

  function dropPoint(index: number) {
    const where = pointAt(index);
    if (!where || 'step' in where) return;
    history.record();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickedVia(null);
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
      if (!alive) return;
      setOpened(true);
      const r = stopsOf(pointsRef.current, viasRef.current);
      const cut = saved && r ? legsAlong(saved, r.stops) : null;
      if (!cut || !r) return;
      // A flown leg goes straight whatever the track held.
      setSavedLegs(
        new Map(
          cut.flatMap((leg, i) => {
            const follow = ways[i < r.goal ? 'up' : 'down'];
            return follow === 'straight'
              ? []
              : [[keyOf(follow, r.stops[i]!, r.stops[i + 1]!), leg] as const];
          }),
        ),
      );
    });
    return () => {
      alive = false;
    };
    // Once, for the network the step opens with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Legs along the ways, one at a time, keyed by what they follow and both ends: the way up
  // (start → goal) follows its activities' network, the way down its own, a flown way straight.
  const route = stopsOf(points, vias);
  const pairs = route ? route.stops.slice(1).map((b, i) => [route.stops[i]!, b] as const) : [];
  const followOf = (i: number): Follow => ways[route && i < route.goal ? 'up' : 'down'];
  /** A round trip's leg back: the way up's leg it retraces, else null. */
  const mirrorOf = (i: number) =>
    backSame && points.start && route && i >= route.goal ? pairs.length - 1 - i : null;
  const legOf = (i: number): LngLat[] | undefined => {
    const up = mirrorOf(i);
    if (up !== null) return legOf(up)?.slice().reverse();
    const [a, b] = pairs[i]!;
    const follow = followOf(i);
    if (follow === 'straight') return [a, b];
    const key = keyOf(follow, a, b);
    return savedLegs.get(key) ?? legs.get(key);
  };
  // A leg back waits for the leg up it retraces.
  const missing = opened
    ? pairs.flatMap((_, i) => (legOf(i) || mirrorOf(i) !== null ? [] : [i]))
    : [];
  const missingKey = missing.map((i) => keyOf(followOf(i), ...pairs[i]!)).join(';');
  useEffect(() => {
    if (!missing.length || !route) return;
    let alive = true;
    void (async () => {
      for (const i of missing) {
        const [a, b] = pairs[i]!;
        const follow = followOf(i);
        const router = routerFor(follow);
        const leg = await router
          .between(a, b, [
            legEnd(i, route.stops.length, route.goal),
            legEnd(i + 1, route.stops.length, route.goal),
          ])
          .catch(() => [a, b]);
        if (!alive) return;
        setIssue(router.issue());
        setLegs((m) => new Map(m).set(keyOf(follow, a, b), leg));
      }
    })();
    return () => {
      alive = false;
    };
    // `missingKey` stands for `missing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  // Straight all through, the route is its points (no track); else the legs joined.
  const line: LngLat[] | null = pairs.some((_, i) => followOf(i) !== 'straight')
    ? pairs.flatMap((pair, i) => {
        const leg = legOf(i) ?? [...pair];
        return i === 0 ? leg : leg.slice(1);
      })
    : null;
  const finding = missing.length > 0;
  const gap = pairs.some((_, i) => followOf(i) !== 'straight' && isGap(legOf(i) ?? []));

  // What the map draws: the line (or straight dashes) and the points.
  useEffect(() => {
    const color = tourTypes[0] ? TOUR_TYPE_TRACK_COLORS[tourTypes[0]] : NO_TYPE_COLOR;
    const straight = route && route.stops.length > 1 ? route.stops : null;
    // The line wears its ways' colours, the way down's from the goal on, as the saved tour will.
    const up =
      line && route && points.end
        ? pairs.slice(0, route.goal).flatMap((pair, i) => {
            const leg = legOf(i) ?? [...pair];
            return i === 0 ? leg : leg.slice(1);
          })
        : null;
    const total = line ? lineLength(line) : 0;
    const bands = line
      ? routeBands(line, draftState.draft, up && total > 0 ? lineLength(up) / total : null)
      : [];
    useMapStore.setState({
      previewLines: {
        type: 'FeatureCollection',
        // Nothing until the saved track is known: no straight stand-in flashing before its shape.
        features: !opened
          ? []
          : line
            ? bands.map((band) => ({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: band.coordinates },
                properties: { color: band.color, width: 4, casing: true },
              }))
            : straight
              ? [
                  {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: straight },
                    properties: { color, width: 3, dashed: true },
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
              const p = kind === 'end' && roundTripSet ? null : points[kind];
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
            legs: pairs.map((pair, i) => legOf(i) ?? [...pair]),
            // A round trip's way back follows the way up: only the way up takes a finger.
            ...(backSame ? { upTo: route.goal } : {}),
            move: (i, to) => moveRef.current(i, to),
            pull: (leg, to) => pullRef.current(leg, to),
            pick: (target) => pickRef.current(target),
            picked:
              pickedLeg !== null
                ? { leg: pickedLeg }
                : pickedVia !== null
                  ? { point: pickedVia }
                  : points[active]
                    ? { point: activeIndex(route, active) }
                    : null,
          }
        : null,
    });
    // Drawn from what the step holds; the line follows from points and legs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, vias, legs, savedLegs, opened, following, active, pickedLeg, pickedVia, backSame]);

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
      // A flown way counts its height change alone, as the saved tour will.
      const tour = { ...draftState.draft, goal: points.goal?.location };
      void profiledMetrics(line, tour).then((metrics) => {
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
  // Measured, a flown way's line is no distance covered (activity-legs).
  const distance = measured?.metrics ? measured.metrics.distance : line ? lineLength(line) : null;
  /** The flight's share of the line, which the walked distance leaves out. */
  const flown = line && distance !== null ? lineLength(line) - distance : 0;
  const minutes = measured?.metrics ? tourMinutes(measured.metrics, draftState.draft, pace) : null;
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

  function cancel() {
    if (back || days > 1) {
      // A day laid out but never given its goal goes; the trip's other days stay.
      if (!useTourDraftStore.getState().goal) useTourDraftStore.getState().removeDay(day);
      router.replace('/tour/edit');
      return;
    }
    // A new segment given up goes back to its tour's sheet.
    const leave = () => {
      const reopen = useTourDraftStore.getState().returnTo;
      useTourDraftStore.getState().reset();
      if (reopen) openTour(reopen);
      else router.back();
    };
    if (!ROUTE_STEPS.some((s) => points[s])) {
      leave();
      return;
    }
    Alert.alert(t('tours.creation.discard'), undefined, [
      { text: t('tours.creation.keepEditing'), style: 'cancel' },
      { text: t('contacts.shared.discardBtn'), style: 'destructive', onPress: leave },
    ]);
  }

  /** Back to the form with the route. */
  async function finish() {
    if (await commit()) router.replace('/tour/edit');
  }

  /** "Next day": this day kept as planned, the next planned here from its end (remounts, keyed). */
  async function planNextDay() {
    if (!(await commit())) return;
    void Haptics.selectionAsync();
    useTourDraftStore.getState().nextDay();
  }

  /** A day's pill: this day kept (or, without a goal yet, dropped), that one planned here. */
  async function showDay(index: number) {
    if (index === day) return;
    const store = useTourDraftStore.getState();
    if (points.goal) {
      await commit();
      store.selectDay(index);
    } else {
      store.removeDay(day);
      useTourDraftStore.getState().selectDay(index < day ? index : index - 1);
    }
  }

  /** The planned points and line into the draft: its route, start, end and track. */
  async function commit(): Promise<boolean> {
    if (!points.goal) return false;
    setFinishing(true);
    const store = useTourDraftStore.getState();
    try {
      const track =
        line && route
          ? {
              points: route.stops,
              legs: pairs.map((pair, i) => legOf(i) ?? [...pair]),
              goal: route.goal,
            }
          : null;
      store.setRoute({ points, track, backSame });
      if (line && line.length > 1) {
        // The line becomes the tour's GPX, with the terrain's heights when online.
        const name = store.draft.name?.trim() || points.goal.name || t('tours.form.gpxDrawn');
        store.setTrack({
          text: await gpxOf(line, name),
          label: t('tours.form.gpxDrawn'),
          line,
          drawing: track,
          // The form routes a way anew when its activities change what it follows.
          follows: following ? ways : null,
        });
      } else if (store.track?.drawing) {
        // A route gone straight takes a planned track away; an uploaded file stays.
        store.setTrack(null);
      }
      return true;
    } finally {
      setFinishing(false);
    }
  }

  // The ways the route has: no start, its line is the way down alone.
  const [first, second] = [points.start ? ways.up : null, points.end ? ways.down : null].filter(
    (way): way is Follow => way !== null,
  );
  const status = followStatus(t, {
    following,
    up: first ?? ways.up,
    down: second ?? null,
    finding,
    unavailable: issue === 'unavailable',
    gap,
  });
  /** What the bin takes out: the selected point between, else a set start or end (never the goal). */
  const removable: { via: number } | { step: RouteStep } | null =
    pickedVia !== null
      ? { via: pickedVia }
      : pickedLeg === null && active !== 'goal' && points[active]
        ? { step: active }
        : null;
  const busy = settling > 0 || finding;

  /** A step's name: the end of a flown way down is the landing. */
  const stepName = (step: RouteStep) =>
    step === 'end' && landing ? t('map.plan.step.landing') : t(`map.plan.step.${step}`);

  return (
    <Screen>
      <Page
        title={
          draftState.mode !== 'create'
            ? t('map.plan.editTitle')
            : days > 1 || draftState.segmentOf
              ? dayLabel(day)
              : t('tours.creation.title')
        }
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
        header={
          <EditActions
            undo={{ onPress: history.undo, disabled: !history.canUndo || busy }}
            redo={{ onPress: history.redo, disabled: !history.canRedo || busy }}
            remove={{
              onPress: () => {
                if (removable && 'via' in removable) dropPoint(removable.via);
                else if (removable) clear(removable.step);
              },
              disabled: !removable || busy,
            }}
          />
        }
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

        <DayPills onSelect={(i) => void showDay(i)} />

        {numbers ? (
          // The route's climb, distance and time first, in view at the sheet's half height.
          <ListSection>
            <ListRow
              title={numbers}
              subtitle={
                flown > FLOWN_NOTE_M
                  ? t('map.plan.flightApart', { distance: formatDistance(flown) })
                  : undefined
              }
              icon="elevation"
              accessibilityLabel={numbers}
            />
          </ListSection>
        ) : null}

        <ListSection
          title={t('map.plan.stepsLabel')}
          footer={[
            pickedLeg !== null
              ? t('map.plan.hint.selectedLeg')
              : pickedVia !== null
                ? t('map.plan.hint.selected')
                : active === 'end' && landing
                  ? t('map.plan.hint.landing')
                  : t(`map.plan.hint.${active}`),
            removable ? t('map.plan.hint.remove') : null,
            route && route.stops.length > 1 && pickedLeg === null && pickedVia === null
              ? t('map.plan.hint.select')
              : null,
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
                      label: t('map.plan.removeStep', { step: stepName(step) }),
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
                    : stepName(step)
                }
                subtitle={
                  p
                    ? [
                        stepName(step),
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
                onPress={() => {
                  setPickedLeg(null);
                  setPickedVia(null);
                  setActive(step);
                }}
                swipeActions={actions.length ? actions : undefined}
                contextActions={actions.length ? actions : undefined}
                accessibilityLabel={`${stepName(step)}: ${p?.name ?? (step === 'goal' ? t('map.plan.required') : t('map.plan.optional'))}`}
              />
            );
          })}
          {points.start && !points.end && !landing ? (
            <ListRow
              title={t('map.plan.roundTrip')}
              icon="u_turn_left"
              onPress={() => {
                void Haptics.selectionAsync();
                history.record();
                setBackSame(true);
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
          {/* The next day from this one's end, without leaving the step (the last day of a new trip). */}
          {draftState.mode === 'create' && day === days - 1 ? (
            <ListRow
              title={t('map.plan.nextDay')}
              subtitle={t('tours.form.nextDayHint')}
              icon="add"
              disabled={!points.goal || waiting || finishing}
              onPress={() => void planNextDay()}
            />
          ) : null}
        </ListSection>

        <FollowSection value={following} onChange={setFollowing} status={status} />
      </Page>
    </Screen>
  );
}

/** Where step `step` sits among the route's points. */
function activeIndex(route: { stops: LngLat[]; goal: number }, step: RouteStep): number {
  if (step === 'goal') return route.goal;
  return step === 'start' ? 0 : route.stops.length - 1;
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
    // A round trip's way back is the way up's, not points of its own.
    goal: route.backSame ? [] : track.points.slice(track.goal + 1, last),
  };
}

/** The points to start from: the draft's (from the form), else none. */
function initialPoints(): RoutePoints {
  const { draft, goal, route } = useTourDraftStore.getState();
  // A round trip's end is its start (`backSame`), not a point of its own.
  if (route) return route.backSame ? { ...route.points, end: null } : route.points;
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
