import {
  LngLatBounds,
  type Map as MapLibreMap,
  type MapMouseEvent,
  type MapTouchEvent,
  type PaddingOptions,
  type Point,
} from 'maplibre-gl';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { SearchInput, type SearchInputHandle } from '@/core/web/search-input.web';
import { Transition } from '@/core/web/transition.web';
import { useElementSize } from '@/core/web/use-element-size.web';
import { useFormatter } from '@/core/web/use-formatter.web';
import { useIsDesktop, useMediaQuery } from '@/core/web/use-media-query.web';
import { currentPace } from '@/core/web/use-pace.web';
import { useReactive } from '@/core/web/use-reactive.web';
import { useSheetInset } from '@/core/web/use-sheet-inset.web';
import type { LocationResult } from '@/features/map/data/services/swisstopo-search-service';
import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import {
  nextStep,
  ROUTE_STEPS,
  routeClimb,
  type PlannedPoint,
  type RoutePlan,
  type RoutePoints,
  type RouteStep,
} from '@/features/map/domain/route-plan';
import { snapNetworkFor } from '@/features/map/domain/snap-network';
import type { TourType } from '@/features/tours/data/models/tour-type';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';
import { suggestTourName } from '@/features/tours/data/services/swisstopo-name-service';
import { getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import { tourMinutes, type RouteMetrics } from '@/features/tours/domain/route-metrics';
import { RouteNumbers } from '@/features/tours/presentation/web/route-numbers.web';

import { FLIGHT_SPEED, frameBounds, isBoundsVisible, TOUR_ZOOM } from './frame-tour.web';
import { LocationSearchResults } from './location-search-results.web';
import { useMapStore } from './map-store.web';
import './route-planner.global.css';
import styles from './route-planner.module.css';
import { createTrackDrawLayer } from './track-draw-layer.web';
import {
  isGap,
  legEnd,
  legHandle,
  skiTilesTemplate,
  tapSnapM,
  useLegRouter,
} from './use-leg-router.web';
import { useLocationSearch } from './use-location-search.web';
import { profileMetrics } from './use-track-drawing.web';

const c = classes(styles);

/** A day's route opens framed this close at most: its hut and its pass, not the whole valley. */
const OPEN_ZOOM = 14;
const NO_MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };
const STEP_ICONS: Record<RouteStep, string> = {
  start: 'trip_origin',
  goal: 'flag',
  end: 'sports_score',
};
const FLICK = 0.5;

const coarse = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;
const at = (p: PlannedPoint): LngLat => [p.location.lng, p.location.lat];
const pairKey = (a: LngLat, b: LngLat) => `${a.join(',')}|${b.join(',')}`;

/** What a press takes hold of: a stop, a point between two of them (its index among the route's stops), or a leg's handle. */
type Grab =
  | { kind: 'stop'; step: RouteStep }
  | { kind: 'via'; index: number }
  | { kind: 'handle'; leg: number };

export interface RoutePlannerProps {
  map: MapLibreMap | null;
  /** The points to start from (read once): none for a new tour, a seeded start, or the form's. */
  initial: RoutePoints;
  /** The step to start on. */
  step: RouteStep;
  title: string;
  /** "Continue" into the form, or "Done" back to it. */
  doneLabel: string;
  /** A tap the page takes instead (a marked ski route): no point is set there. */
  routeHit?: (point: Point) => boolean;
  /** Another way to set the route, e.g. tapping a marked ski route. */
  hint?: string;
  /** The map area the page covers beside the planner (the form's drawer on desktop). */
  covered?: Partial<PaddingOptions>;
  /** The stage's drawing, its goal marked (read once): its way and its points between the stops stay. */
  track?: DrawnTrack | null;
  /** An uploaded track the stage keeps as it is: nothing to follow, its own numbers. */
  fixedLine?: LngLat[] | null;
  /** The stage's activities: what the legs follow, and how the time is reckoned. */
  tourTypes?: readonly TourType[];
  /** The trip's days by label, this one at `day`: from two on, the panel switches between them. */
  days?: readonly string[];
  day?: number;
  /** The trip's last day: "+ Next day" plans the one after it. */
  canAddDay?: boolean;
  /** A form is behind the step: leaving goes back to it (an arrow), not out of the tour (a cross). */
  back?: boolean;
  /** The legs follow the ways (else straight lines); the page holds it across the trip's days. */
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  /** On a phone, the panel folded down to its summary (D14); the page holds it across the days too. */
  compact?: boolean;
  onCompactChange?: (compact: boolean) => void;
  onChange?: (points: RoutePoints) => void;
  /** The line the map draws: along the ways, the uploaded track, or null for straight legs. */
  onLine?: (line: LngLat[] | null) => void;
  onDone: (plan: RoutePlan) => void;
  onNextDay: (plan: RoutePlan) => void;
  onSelectDay: (index: number, plan: RoutePlan) => void;
  onCancel: () => void;
}

/**
 * The route step of a tour's creation (map-first-tour-creation D1, D8–D10, D13–D14): start → goal →
 * end set in order by a tap on the map or a search result, each named and measured at once, any of
 * them dragged to move it. The legs between them follow the ways the map shows (or go straight, the
 * user's choice), and that line is the tour's track: a leg's middle handle pulls out a point between
 * the stops to shape it, as the track drawer's does, and a drawing it is handed keeps its own way and
 * its points. The numbers — distance, time, climb, descent — come from the terrain under the line. A
 * trip's days switch right here, and "+ Next day" plans the one after. On a phone the panel folds down
 * to its summary, for more map.
 *
 * Map handlers are bound once and reach the current props and state through `live` (Vue setup
 * semantics); derived values are functions of that state.
 */
export function RoutePlanner(props: RoutePlannerProps) {
  'use no memo';
  const { t, i18n } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  const { formatElevation } = useFormatter();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const online = useStore(connectivity, (st) => st.online);
  const activeOverlays = useMapStore((st) => st.activeOverlays);
  const isDesktop = useIsDesktop();
  const follow = props.follow ?? true;
  const compact = props.compact ?? false;
  const network = snapNetworkFor(activeOverlays, props.tourTypes ?? []);
  const live = useRef({ props, network, isDesktop });
  live.current = { props, network, isDesktop };
  const map = props.map;

  const s = useReactive(() => ({
    points: { ...props.initial } as RoutePoints,
    active: props.step as RouteStep,
    /** × with points set and no form behind would lose them: it asks first, like the form's ×. */
    confirmingClose: false,
    /** A drawing's points between the stops: on the way up (start → goal) and down (goal → end). */
    vias: ((): { up: LngLat[]; down: LngLat[] } => {
      const track = props.track;
      if (track?.goal == null) return { up: [], down: [] };
      return {
        up: track.points.slice(1, track.goal),
        down: track.points.slice(track.goal + 1, -1),
      };
    })(),
    /** A point held under the finger: its legs wait until it is let go. */
    dragging: false,
    /** Bumped on every leg routed (the Map itself is not reactive). */
    routedVersion: 0,
    /** The map's zoom, for the handles: a leg too short on screen has none. */
    zoom: props.map?.getZoom() ?? 0,
    lineNumbers: null as { metrics: RouteMetrics; minutes: number | null } | null,
    /** Leaving the step waits for the legs still loading: the track handed on is the one shown. */
    waiting: null as ((plan: RoutePlan) => void) | null,
    /** The rows' height while a finger pulls the sheet; null at rest. */
    pulled: null as number | null,
  }));
  const setPoint = (step: RouteStep, point: PlannedPoint | null) =>
    (s.points = { ...s.points, [step]: point });

  const [fixed] = useState(() => !!props.fixedLine?.length);
  const mode = (): 'follow' | 'straight' | 'fixed' =>
    fixed ? 'fixed' : (live.current.props.follow ?? true) ? 'follow' : 'straight';

  function close() {
    if (!live.current.props.back && ROUTE_STEPS.some((kind) => s.points[kind]))
      s.confirmingClose = true;
    else live.current.props.onCancel();
  }

  // ── Lookups: a set point is named (unless a search named it) and measured at once ──
  const lookups = useRef<Partial<Record<RouteStep, AbortController>>>({});

  function place(step: RouteStep, location: { lng: number; lat: number }, name?: string) {
    lookups.current[step]?.abort();
    const own = new AbortController();
    lookups.current[step] = own;
    const point: PlannedPoint = { location, name: name ?? null, elevation: null, loading: true };
    setPoint(step, point);
    void Promise.all([
      name ?? suggestTourName(location, own.signal).catch(() => null),
      getElevation(location, own.signal).catch(() => null),
    ]).then(([found, height]) => {
      if (lookups.current[step] !== own) return;
      setPoint(step, { ...point, name: found ?? null, elevation: height, loading: false });
    });
  }

  /** A point just set moves the plan on to the next step still open. */
  function setAndAdvance(step: RouteStep, location: { lng: number; lat: number }, name?: string) {
    place(step, location, name);
    s.active = nextStep(s.points, step);
  }

  function clear(step: RouteStep) {
    lookups.current[step]?.abort();
    delete lookups.current[step];
    setPoint(step, null);
    // The points of a drawing on the way up (or down) go with the start (or end) they led from.
    if (step === 'start') s.vias = { ...s.vias, up: [] };
    else if (step === 'end') s.vias = { ...s.vias, down: [] };
  }

  function skip() {
    s.active = nextStep(s.points, s.active);
  }

  /** Back to the start, by default the way up: through its points between, its legs reversed (`legOf`). */
  function roundTrip() {
    const start = s.points.start;
    if (!start) return;
    lookups.current.end?.abort();
    setPoint('end', { ...start, location: { ...start.location } });
    s.vias = { ...s.vias, down: [...s.vias.up].reverse() };
  }
  /** The end is back at the start: its row says so with the drawer's "back to the start" mark. */
  const roundTripSet =
    !!s.points.start &&
    !!s.points.end &&
    isSameGoal(s.points.start.location, s.points.end.location, 1);

  // ── Search ──
  const searchInput = useRef<SearchInputHandle>(null);
  const panel = useRef<HTMLElement>(null);
  // Past four days the pills scroll: the day being planned scrolls into sight.
  const dayStrip = useRef<HTMLElement>(null);
  function showActiveDay(behavior: ScrollBehavior = 'smooth') {
    const strip = dayStrip.current;
    const pill = strip?.querySelector<HTMLElement>('.day--active');
    strip?.scrollTo?.({
      left: pill ? pill.offsetLeft - (strip.clientWidth - pill.offsetWidth) / 2 : 0,
      behavior,
    });
  }
  const { height } = useElementSize(panel, { box: 'border-box' });
  const { state: search, take } = useLocationSearch({
    locale: () => i18n.language,
    role: () => s.active,
    origin: () => {
      const m = live.current.props.map;
      return m && { center: m.getCenter(), zoom: m.getZoom() };
    },
  });

  function choose(result: LocationResult | undefined) {
    if (!result) return;
    take(result);
    search.query = '';
    searchInput.current?.blur();
    setAndAdvance(s.active, { lng: result.lng, lat: result.lat }, result.name);
    frameRoute({ lng: result.lng, lat: result.lat }, result.zoom);
  }

  /**
   * After a search the route shows whole: every set point framed beside the panel and the search,
   * not the result alone — a lone point flies in at the result's own zoom.
   */
  function frameRoute(spot: { lng: number; lat: number } | null, zoom: number, always = false) {
    const m = live.current.props.map;
    const set = ROUTE_STEPS.flatMap((step) => (s.points[step] ? [s.points[step]!.location] : []));
    if (!m || set.length === 0) return;
    // Measured now: the search pill alone (not its open list), the panel as it stands.
    const desktop = live.current.isDesktop;
    const panelBox = panel.current?.getBoundingClientRect();
    const covered = {
      top: searchInput.current?.el()?.getBoundingClientRect().bottom ?? 0,
      bottom: desktop ? 0 : (panelBox?.height ?? 0),
      left: desktop ? (panelBox?.right ?? 0) : 0,
      right: live.current.props.covered?.right ?? 0,
    };
    const bounds = set.reduce((b, p) => b.extend([p.lng, p.lat]), new LngLatBounds());
    if (set.length > 1) {
      if (always || !isBoundsVisible(m, bounds, covered))
        frameBounds(m, bounds, covered, { maxZoom: Math.max(zoom, TOUR_ZOOM) });
      return;
    }
    const lone = spot ?? set[0]!;
    if (!spot && isBoundsVisible(m, bounds, covered)) return;
    // Centred in the area beside the panel by an offset: padding would stay set on the map and add
    // to every later framing's own (`frameBounds`), so it is cleared here.
    const offset: [number, number] = [
      (covered.left - covered.right) / 2,
      (covered.top - covered.bottom) / 2,
    ];
    const camera = {
      center: [lone.lng, lone.lat] as [number, number],
      zoom,
      offset,
      padding: NO_MARGIN,
      speed: FLIGHT_SPEED,
    };
    if (reducedMotionRef.current) m.jumpTo(camera);
    else m.flyTo(camera);
  }
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  // ── Legs along the ways (D8) ──
  const router = useLegRouter({
    network: () => live.current.network,
    skiTemplate: () => skiTilesTemplate(live.current.props.map),
    maxTiles: 64,
  });

  /**
   * The drawing's legs, kept as drawn while their two points stay; then each leg routed so far, per
   * network. A leg whose way the other way round is known goes back on it (a round trip's way back).
   */
  const [given] = useState(
    () =>
      new Map(
        (props.track?.legs ?? []).map((leg, i) => [
          pairKey(props.track!.points[i]!, props.track!.points[i + 1]!),
          leg,
        ]),
      ),
  );
  const [routed] = useState(() => new Map<string, LngLat[]>());
  const setRouted = (key: string, leg: LngLat[]) => {
    routed.set(key, leg);
    s.routedVersion++;
  };
  const routedKey = (a: LngLat, b: LngLat) => `${live.current.network ?? 'ways'}|${pairKey(a, b)}`;
  function legOf(a: LngLat, b: LngLat): LngLat[] | null {
    if (a[0] === b[0] && a[1] === b[1]) return [a, b];
    const back = given.get(pairKey(b, a)) ?? routed.get(routedKey(b, a));
    return (
      given.get(pairKey(a, b)) ?? routed.get(routedKey(a, b)) ?? (back ? [...back].reverse() : null)
    );
  }

  /** The route's stops in order, the goal's place among them; none before there is a goal. */
  function route() {
    const { start, goal, end } = s.points;
    if (!goal) return null;
    const up = start ? s.vias.up : [];
    const stops = [
      ...(start ? [at(start), ...up] : []),
      at(goal),
      ...(end ? [...s.vias.down, at(end)] : []),
    ];
    return { stops, goal: start ? 1 + up.length : 0 };
  }
  const pairs = () => {
    const r = route();
    return r?.stops.slice(1).map((b, i) => [r.stops[i]!, b] as const) ?? [];
  };
  /** Legs still to route: none while the route goes straight or keeps its upload. */
  const pending = () => (mode() === 'follow' ? pairs().filter(([a, b]) => !legOf(a, b)) : []);
  const settled = () => pending().length === 0;

  const routing = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function routeLegs() {
    if (routing.current) return;
    routing.current = true;
    try {
      let next = pending()[0];
      while (next && !s.dragging) {
        const [a, b] = next;
        const key = routedKey(a, b);
        const { stops, goal } = route()!;
        const i = stops.indexOf(a);
        const leg = await router
          .between(a, b, [legEnd(i, stops.length, goal), legEnd(i + 1, stops.length, goal)])
          .catch(() => [a, b]);
        if (!alive.current) return;
        setRouted(key, leg);
        next = pending()[0];
      }
    } finally {
      routing.current = false;
    }
  }
  const isSettled = settled();
  // Vue's watch on [pending, dragging]: any change may leave a leg to route; the guard keeps one run.
  useEffect(() => {
    if (!isSettled && !s.dragging) void routeLegs();
  });

  /** A leg the ways didn't lead along (a point far off them): it goes straight, and the panel says so. */
  const gap =
    mode() === 'follow' && pairs().some(([a, b]) => isGap(routed.get(routedKey(a, b)) ?? []));

  /** The line along the stops, a leg still loading straight meanwhile. */
  function routeLine(): LngLat[] | null {
    const p = pairs();
    if (p.length === 0) return null;
    return p.flatMap(([a, b], i) => {
      const leg = legOf(a, b) ?? [a, b];
      return i === 0 ? leg : leg.slice(1);
    });
  }
  const shownLine = useMemo(
    () => (mode() === 'fixed' ? props.fixedLine! : mode() === 'follow' ? routeLine() : null),
    [s.points, s.vias, s.routedVersion, network, follow],
  );
  useEffect(() => void props.onLine?.(shownLine), [shownLine]);
  useEffect(() => void props.onChange?.({ ...s.points }), [s.points]);

  // ── Shaping the line: points between the stops (D13) ──
  /** The route's stops that are points between (not its start, goal or end), by their index; none going straight. */
  function viaIndices() {
    const r = route();
    if (!r || mode() !== 'follow') return [];
    return r.stops.flatMap((_, i) => (legEnd(i, r.stops.length, r.goal) === 'via' ? [i] : []));
  }

  /** The points between spliced at the route's stop `index`: on the way up before the goal, down after it. */
  function spliceVias(index: number, drop: number, ...add: LngLat[]) {
    const goal = route()?.goal ?? 0;
    const side = index <= goal ? 'up' : 'down';
    const list = [...s.vias[side]];
    list.splice(side === 'up' ? index - 1 : index - goal - 1, drop, ...add);
    s.vias = { ...s.vias, [side]: list };
  }

  /** Each leg's handle to pull a point out of, once the leg follows its way; none while a point is held. */
  const handles = () =>
    mode() === 'follow' && !s.dragging
      ? pairs().map(([a, b]) => {
          const leg = legOf(a, b);
          return leg && legHandle(leg, s.zoom);
        })
      : [];

  // The points between and the handles as the drawer draws them; the page draws the line and the stops.
  const editLayer = useRef<ReturnType<typeof createTrackDrawLayer> | null>(null);
  function drawEdits() {
    const r = route();
    editLayer.current?.update(
      { points: viaIndices().length ? r!.stops : [], legs: [], goal: r?.goal },
      [],
      handles(),
    );
  }
  useEffect(drawEdits, [s.points, s.vias, s.routedVersion, s.zoom, s.dragging, network, follow]);

  // ── Gestures: a tap sets the active point, a press on a point (or a leg's handle) drags it ──

  /** What lies under `spot` within fingertip reach: a stop first (the places), then a point between, then a handle. */
  function grabAt(spot: Point): Grab | null {
    const m = live.current.props.map!;
    const nearest = (spots: readonly (LngLat | null)[]) => {
      let best = -1;
      let bestDistance = coarse() ? 24 : 12;
      spots.forEach((p, i) => {
        const d = p ? m.project(p).dist(spot) : Infinity;
        if (d <= bestDistance) {
          best = i;
          bestDistance = d;
        }
      });
      return best;
    };
    const stop = nearest(ROUTE_STEPS.map((step) => s.points[step] && at(s.points[step]!)));
    if (stop >= 0) return { kind: 'stop', step: ROUTE_STEPS[stop]! };
    const stops = route()?.stops ?? [];
    const vias = viaIndices();
    const via = nearest(stops.map((p, i) => (vias.includes(i) ? p : null)));
    if (via >= 0) return { kind: 'via', index: via };
    const handle = nearest(handles());
    return handle >= 0 ? { kind: 'handle', leg: handle } : null;
  }

  const gesture = useRef<{
    drag: { grab: Grab; from: Point; to: LngLat | null } | null;
    /** A drag ends in a click event too; that one must not set a point. */
    dragged: boolean;
  }>({ drag: null, dragged: false });

  function onClick(e: MapMouseEvent) {
    const g = gesture.current;
    if (g.dragged) {
      g.dragged = false;
      return;
    }
    const hit = grabAt(e.point);
    if (hit?.kind === 'stop') s.active = hit.step;
    // A tap on a point between takes it out: the leg runs straight on along the ways.
    else if (hit?.kind === 'via') spliceVias(hit.index, 1);
    // On a leg's handle it was a grab, not a new point.
    else if (!hit && !live.current.props.routeHit?.(e.point))
      setAndAdvance(s.active, { lng: e.lngLat.lng, lat: e.lngLat.lat });
  }

  function onPress(e: MapMouseEvent | MapTouchEvent) {
    if ('touches' in e.originalEvent && e.originalEvent.touches.length > 1) return;
    const hit = grabAt(e.point);
    if (!hit) return;
    // Holds the map still: this gesture moves the point, not the map.
    e.preventDefault();
    gesture.current.drag = { grab: hit, from: e.point, to: null };
  }

  function onMove(e: MapMouseEvent | MapTouchEvent) {
    const drag = gesture.current.drag;
    if (!drag) {
      if (!coarse())
        live.current.props.map!.getCanvas().style.cursor = grabAt(e.point) ? 'grab' : 'crosshair';
      return;
    }
    // Under 4 px it is a tap on the point, not a drag.
    if (!drag.to && e.point.dist(drag.from) < 4) return;
    const to: LngLat = [e.lngLat.lng, e.lngLat.lat];
    drag.to = to;
    s.dragging = true;
    const { grab } = drag;
    if (grab.kind === 'stop') {
      const p = s.points[grab.step];
      if (p) setPoint(grab.step, { ...p, location: { lng: to[0], lat: to[1] } });
    } else if (grab.kind === 'via') {
      spliceVias(grab.index, 1, to);
    } else {
      // Pulled out of its leg: from here on a point between, moved like one.
      spliceVias(grab.leg + 1, 0, to);
      drag.grab = { kind: 'via', index: grab.leg + 1 };
    }
  }

  function onRelease() {
    const g = gesture.current;
    const held = g.drag;
    g.drag = null;
    if (!held?.to) {
      s.dragging = false;
      return;
    }
    g.dragged = true;
    // A touch drag fires no click to reset it.
    setTimeout(() => (g.dragged = false), 0);
    const { grab, to } = held;
    if (grab.kind === 'via') {
      void land(grab.index, to);
      return;
    }
    if (grab.kind === 'stop') {
      s.active = grab.step;
      // Elsewhere now: named and measured again, as a new tap would be.
      place(grab.step, { lng: to[0], lat: to[1] });
    }
    s.dragging = false;
  }

  /**
   * A point between let go lands on the way the leg before it reaches there, as a point dragged in
   * the drawer does — a stop is a place and stays where it was set, a point between only says which
   * way — and that leg is the one it came by; the leg on follows the ways from there.
   */
  async function land(index: number, spot: LngLat) {
    const before = route()!.stops[index - 1]!;
    const radius = tapSnapM(spot[1], live.current.props.map?.getZoom() ?? TOUR_ZOOM, coarse());
    const { to, line } = await router
      .resolve(before, spot, radius)
      .catch(() => ({ to: spot, line: null }));
    // Moved again, or taken out, meanwhile: that stands.
    if (alive.current && route()?.stops[index] === spot) {
      if (line && !isGap(line)) setRouted(routedKey(before, to), line);
      spliceVias(index, 1, to);
    }
    s.dragging = false;
  }

  // Handlers bound once call the latest render's functions.
  const handlers = useRef({ onClick, onPress, onMove, onRelease, close });
  handlers.current = { onClick, onPress, onMove, onRelease, close };

  useEffect(() => {
    // A point handed over still unnamed (the next day starting at a goal) is looked up like a new one.
    ROUTE_STEPS.forEach((step) => {
      const p = s.points[step];
      if (p?.loading) place(step, p.location);
    });
    // The points it opens with (the next day's start, the form's route) fill the view beside the panel.
    frameRoute(null, Math.max(map?.getZoom() ?? 0, OPEN_ZOOM), true);
    showActiveDay('instant');
    const lookupsNow = lookups.current;
    if (!map) return () => ROUTE_STEPS.forEach((step) => lookupsNow[step]?.abort());

    editLayer.current = createTrackDrawLayer(map, 'route-plan-edit');
    editLayer.current.setup();
    drawEdits();
    const onZoom = () => (s.zoom = map.getZoom());
    map.on('zoom', onZoom);

    const events = [
      ['click', (e: MapMouseEvent) => handlers.current.onClick(e)],
      ['mousedown', (e: MapMouseEvent) => handlers.current.onPress(e)],
      ['touchstart', (e: MapTouchEvent) => handlers.current.onPress(e)],
      ['mousemove', (e: MapMouseEvent) => handlers.current.onMove(e)],
      ['touchmove', (e: MapTouchEvent) => handlers.current.onMove(e)],
      ['mouseup', () => handlers.current.onRelease()],
      ['touchend', () => handlers.current.onRelease()],
      ['touchcancel', () => handlers.current.onRelease()],
    ] as const;
    for (const [event, handler] of events) map.on(event, handler as never);
    // Double-tap zoom would read as two points.
    map.doubleClickZoom.disable();
    map.getContainer().classList.add('route-planning');
    if (!coarse()) map.getCanvas().style.cursor = 'crosshair';

    return () => {
      ROUTE_STEPS.forEach((step) => lookupsNow[step]?.abort());
      map.off('zoom', onZoom);
      editLayer.current?.remove();
      editLayer.current = null;
      for (const [event, handler] of events) map.off(event, handler as never);
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove('route-planning');
      map.getCanvas().style.cursor = '';
    };
  }, []);

  const firstDay = useRef(true);
  useEffect(() => {
    if (firstDay.current) {
      firstDay.current = false;
      return;
    }
    showActiveDay();
  }, [props.day]);

  // Escape leaves the route step only — before the drawer beside it (desktop) reads it as closing the form.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (search.listOpen) search.listOpen = false;
      else if (s.confirmingClose) s.confirmingClose = false;
      else handlers.current.close();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  // ── Numbers ──
  /**
   * Distance, time, climb and descent of the line, from the terrain under it: held while a leg
   * loads (no blank in between, no guess) and changed once, to the final numbers. Going straight,
   * the climb comes from the points' heights.
   */
  const measuring = useRef(0);
  const currentMode = mode();
  useEffect(() => {
    const timer = setTimeout(() => {
      const run = ++measuring.current;
      if (currentMode === 'straight' || !shownLine) {
        s.lineNumbers = null;
        return;
      }
      if (!isSettled) return;
      void getTrackProfile(shownLine)
        .catch(() => null)
        .then((profile) => {
          if (run !== measuring.current) return;
          const metrics = profileMetrics(shownLine, profile);
          s.lineNumbers = {
            metrics,
            minutes:
              profile &&
              tourMinutes(
                metrics,
                { tourTypes: live.current.props.tourTypes ?? [] },
                currentPace(),
              ),
          };
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [currentMode, isSettled, shownLine]);

  // The climb from the points' heights, held while a point is being measured.
  const climbRef = useRef(routeClimb(s.points));
  if (!ROUTE_STEPS.some((step) => s.points[step]?.loading)) climbRef.current = routeClimb(s.points);
  const climb = climbRef.current;
  const numbers =
    currentMode !== 'straight'
      ? s.lineNumbers
      : climb && { metrics: { distance: null, ...climb }, minutes: null };
  /** The line is there, its numbers on their way. */
  const measuringLine = !numbers && !!shownLine;

  // ── Panel ──
  const vias = viaIndices();
  /** What to do next: set the point at hand, else shape the line along the ways. */
  const instruction = !s.points[s.active]
    ? tk(`map.plan.hint.${s.active}`)
    : vias.length
      ? t('map.plan.hint.via')
      : currentMode === 'follow' && pairs().length
        ? t('map.plan.hint.shape')
        : t('map.plan.hint.move');

  /** A leg is on its way along the ways (not while a point is held: it waits to be let go). */
  const finding = !isSettled && !s.dragging;

  /** What the legs follow, in words — or that a leg is on its way, or found none. */
  const followStatus =
    currentMode === 'fixed'
      ? t('map.plan.follow.fixed')
      : currentMode === 'straight'
        ? t('map.plan.follow.straight')
        : router.issue === 'unavailable'
          ? t('map.plan.follow.unavailable')
          : finding
            ? t('map.plan.follow.finding')
            : gap
              ? t('map.plan.follow.gap')
              : tk(`map.plan.follow.${network ?? 'ways'}`);
  /** Folded, the summary says what the folded row would: a leg on its way, or a way not found. */
  const followNews = currentMode === 'follow' && (router.issue === 'unavailable' || finding || gap);

  function currentPlan(): RoutePlan {
    const r = route();
    const track =
      mode() === 'follow' && r && r.stops.length > 1
        ? { points: r.stops, legs: pairs().map(([a, b]) => legOf(a, b) ?? [a, b]), goal: r.goal }
        : null;
    return { points: { ...s.points }, track };
  }

  function finish(then: (plan: RoutePlan) => void) {
    if (settled()) then(currentPlan());
    else s.waiting = then;
  }
  useEffect(() => {
    const then = s.waiting;
    if (isSettled && then) {
      s.waiting = null;
      then(currentPlan());
    }
  }, [isSettled]);

  // On a phone the panel is a bottom sheet: bottom toasts (`--sheet-inset`) rise above its buttons,
  // and the camera frames above it. Docked left on desktop, it leaves the centred toasts clear.
  const publishInset = useSheetInset();
  useEffect(() => void publishInset(isDesktop ? 0 : height), [isDesktop, height]);

  // ── Folding the sheet (phone, D14) ──
  // Its grip, or its head, pulled down folds the points' rows away for more map — the day, the
  // numbers and the buttons stay — and pulled up (or the grip tapped) unfolds them; a flick goes
  // all the way.
  const foldBody = useRef<HTMLDivElement>(null);
  const { height: foldNatural } = useElementSize(foldBody, { box: 'border-box' });
  const foldable = !isDesktop;
  const folded = foldable && compact;
  const pull = useRef<{
    y: number;
    from: number;
    prev: { y: number; t: number };
    last: { y: number; t: number };
  } | null>(null);
  /** A pull ends in a click on the grip too; that one must not toggle it back. */
  const pulledNow = useRef(false);

  function onPullStart(e: ReactPointerEvent) {
    if (!foldable || (e.target as Element).closest('button:not(.grip), a, input')) return;
    const mark = { y: e.clientY, t: e.timeStamp };
    pull.current = { y: e.clientY, from: folded ? 0 : foldNatural, prev: mark, last: mark };
  }

  function onPullMove(e: ReactPointerEvent) {
    const p = pull.current;
    if (!p) return;
    const dy = e.clientY - p.y;
    if (s.pulled == null) {
      // Under 4 px it is a tap; a sideways swipe scrolls the days.
      if (Math.abs(dy) < 4) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    s.pulled = Math.min(foldNatural, Math.max(0, p.from - dy));
    p.prev = p.last;
    p.last = { y: e.clientY, t: e.timeStamp };
  }

  function onPullEnd(e: ReactPointerEvent) {
    const p = pull.current;
    pull.current = null;
    if (!p || s.pulled == null) return;
    // A release still moving fast goes on that way; a resting one settles where nearer.
    const dt = p.last.t - p.prev.t;
    const velocity = dt > 0 && e.timeStamp - p.last.t < 100 ? (p.last.y - p.prev.y) / dt : 0;
    props.onCompactChange?.(Math.abs(velocity) > FLICK ? velocity > 0 : s.pulled < foldNatural / 2);
    s.pulled = null;
    pulledNow.current = true;
    setTimeout(() => (pulledNow.current = false), 0);
  }

  function toggleFold() {
    if (!pulledNow.current) props.onCompactChange?.(!compact);
  }

  /** The rows glide to their height, follow the finger, or fold to none; measured first, so never a jump. */
  const foldStyle =
    !foldable || (!foldNatural && !folded)
      ? undefined
      : { height: `${s.pulled ?? (folded ? 0 : foldNatural)}px` };

  const { days, day, back } = props;
  const points = s.points;
  const active = s.active;

  return createPortal(
    <>
      <div className={c('planner-search', { 'planner-search--open': search.listOpen })}>
        {online && (
          <SearchInput
            ref={searchInput}
            value={search.query}
            onChange={(q) => (search.query = q)}
            className={c('search-field')}
            placeholder={
              active === 'goal'
                ? t('tours.picker.search.placeholder')
                : t('tours.picker.search.placeholderAccess')
            }
            label={t('tours.picker.search.label')}
            data-testid="planner-search"
            onEnter={() => choose(search.results[0])}
          >
            {search.query && (
              <BaseIconButton
                name="close"
                size="sm"
                label={t('tours.picker.search.clear')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => (search.query = '')}
              />
            )}
          </SearchInput>
        )}
        <Transition name="results" cls={c}>
          {online && search.listOpen && (
            <LocationSearchResults
              results={search.results}
              failed={search.failed}
              onChoose={choose}
            />
          )}
        </Transition>
      </div>

      <section
        ref={panel}
        className={c('planner')}
        aria-label={props.title}
        data-testid="route-planner"
      >
        <div
          className={c('top')}
          onPointerDown={onPullStart}
          onPointerMove={onPullMove}
          onPointerUp={onPullEnd}
          onPointerCancel={onPullEnd}
        >
          {foldable && (
            <button
              type="button"
              className={c('grip')}
              aria-expanded={!folded}
              aria-controls="planner-fold"
              aria-label={folded ? t('map.plan.unfold') : t('map.plan.fold')}
              data-testid="planner-grip"
              onClick={toggleFold}
            >
              <span className={c('grip-bar')} />
            </button>
          )}
          <header className={c('head')}>
            {back && (
              <BaseIconButton
                name="arrow_back"
                variant="tonal"
                label={t('map.plan.back')}
                data-testid="planner-cancel"
                onClick={props.onCancel}
              />
            )}
            {days && days.length > 1 ? (
              <nav
                ref={dayStrip}
                className={c('days')}
                aria-label={t('tours.creation.daysLabel')}
                data-testid="planner-days"
              >
                {days.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    className={c('day', { 'day--active': i === day })}
                    aria-current={i === day ? 'step' : undefined}
                    data-testid={`planner-day-${i}`}
                    onClick={() => i !== day && finish((plan) => props.onSelectDay(i, plan))}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            ) : (
              <h2 className={c('title')}>{props.title}</h2>
            )}
            {!back && (
              <BaseIconButton
                name="close"
                variant="tonal"
                label={t('tours.picker.cancelBtn')}
                data-testid="planner-cancel"
                onClick={close}
              />
            )}
          </header>
        </div>

        {s.confirmingClose && (
          <div
            className={c('discard')}
            role="alertdialog"
            aria-labelledby="planner-discard-title"
            data-testid="planner-discard"
          >
            <p id="planner-discard-title" className={c('discard-text')}>
              <BaseIcon name="warning" className={c('discard-icon')} />
              {t('tours.creation.discard')}
            </p>
            <div className={c('discard-actions')}>
              <BaseButton
                type="button"
                variant="secondary"
                size="sm"
                data-testid="planner-discard-keep"
                onClick={() => (s.confirmingClose = false)}
              >
                {t('tours.creation.keepEditing')}
              </BaseButton>
              <BaseButton
                type="button"
                variant="danger"
                size="sm"
                data-testid="planner-discard-confirm"
                onClick={props.onCancel}
              >
                {t('contacts.shared.discardBtn')}
              </BaseButton>
            </div>
          </div>
        )}

        <div
          id="planner-fold"
          className={c('fold', { 'fold--pulled': s.pulled != null })}
          style={foldStyle}
          inert={folded}
        >
          <div ref={foldBody} className={c('fold-body')}>
            <ol className={c('stops')} aria-label={t('map.plan.stepsLabel')}>
              {ROUTE_STEPS.map((kind) => {
                const point = points[kind];
                return (
                  <li
                    key={kind}
                    className={c('stop', { 'stop--active': active === kind, 'stop--set': !!point })}
                  >
                    <button
                      type="button"
                      className={c('stop-main')}
                      aria-pressed={active === kind}
                      data-testid={`planner-step-${kind}`}
                      onClick={() => (s.active = kind)}
                    >
                      <span className={c('stop-mark')} aria-hidden="true">
                        <BaseIcon
                          name={kind === 'end' && roundTripSet ? 'u_turn_left' : STEP_ICONS[kind]}
                          size="sm"
                        />
                      </span>
                      <span className={c('stop-label')}>{tk(`map.plan.step.${kind}`)}</span>
                      {point?.loading ? (
                        <span className={c('stop-skeleton')} aria-hidden="true" />
                      ) : point ? (
                        <span className={c('stop-name')}>
                          {point.name || t('map.plan.unnamed')}
                        </span>
                      ) : (
                        <span className={c('stop-empty')}>
                          {kind === 'goal' ? t('map.plan.required') : t('map.plan.optional')}
                        </span>
                      )}
                      {point && !point.loading && (
                        <span className={c('stop-height')}>
                          {point.elevation == null ? '' : formatElevation(point.elevation)}
                        </span>
                      )}
                    </button>
                    {kind !== 'goal' && point ? (
                      <BaseIconButton
                        name="close"
                        size="sm"
                        data-testid={`planner-remove-${kind}`}
                        label={t('map.plan.removeStep', { step: tk(`map.plan.step.${kind}`) })}
                        onClick={() => clear(kind)}
                      />
                    ) : kind === 'end' && points.start ? (
                      <BaseButton
                        variant="secondary"
                        size="sm"
                        className={c('stop-action')}
                        data-testid="planner-roundTrip"
                        onClick={roundTrip}
                      >
                        <BaseIcon name="u_turn_left" size="sm" />
                        {t('map.plan.roundTrip')}
                      </BaseButton>
                    ) : kind === 'start' && !points.start && active === 'start' ? (
                      <BaseButton
                        variant="text"
                        size="sm"
                        className={c('stop-action')}
                        data-testid="planner-skip"
                        onClick={skip}
                      >
                        {t('map.plan.skip')}
                      </BaseButton>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {props.hint && <p className={c('route-hint')}>{props.hint}</p>}

            <div
              className={c('follow', {
                'follow--off': currentMode !== 'follow',
                'follow--gap': gap && !finding,
              })}
              data-testid="planner-follow"
            >
              {currentMode === 'follow' && finding ? (
                <span className={c('follow-icon follow-spinner')} aria-hidden="true" />
              ) : (
                <BaseIcon
                  name={currentMode === 'follow' ? 'route' : 'timeline'}
                  size="sm"
                  className={c('follow-icon')}
                />
              )}
              <span className={c('follow-text')}>{followStatus}</span>
              {currentMode !== 'fixed' && (
                <button
                  type="button"
                  role="switch"
                  className={c('switch')}
                  aria-checked={follow}
                  aria-label={t('map.plan.follow.label')}
                  data-testid="planner-follow-switch"
                  onClick={() => props.onFollowChange?.(!follow)}
                >
                  <span className={c('switch-thumb')} />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className={c('status')} role="status">
          {numbers ? (
            <span
              className={c('numbers', { 'numbers--stale': finding })}
              data-testid="planner-climb"
            >
              <RouteNumbers metrics={numbers.metrics} minutes={numbers.minutes} />
            </span>
          ) : measuringLine ? (
            <span className={c('numbers numbers--pending')}>{t('map.plan.measuring')}</span>
          ) : null}
          {folded && followNews ? (
            <span
              className={c('instruction', { 'instruction--warn': !finding })}
              data-testid="planner-note"
            >
              {followStatus}
            </span>
          ) : (
            <span className={c('instruction')}>{instruction}</span>
          )}
        </p>

        <div className={c('actions')}>
          {props.canAddDay && (
            <BaseButton
              variant="secondary"
              disabled={!points.goal || !!s.waiting}
              data-testid="planner-next-day"
              onClick={() => finish((plan) => props.onNextDay(plan))}
            >
              <BaseIcon name="add" />
              {t('map.plan.nextDay')}
            </BaseButton>
          )}
          <span className={c('spacer')} />
          <BaseButton
            variant="primary"
            disabled={!points.goal || !!s.waiting}
            data-testid="planner-done"
            onClick={() => finish((plan) => props.onDone(plan))}
          >
            {props.doneLabel}
          </BaseButton>
        </div>
      </section>
    </>,
    document.body,
  );
}
