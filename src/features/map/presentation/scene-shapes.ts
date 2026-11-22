import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormatter } from '@/core/i18n/format';
import { chainArc } from '@/features/map/domain/chain-arc';
import { bandLine, NO_TYPE_COLOR, type Band } from '@/features/map/domain/track-bands';
import {
  distinctTypeColors,
  TOUR_TYPE_COLORS,
  TOUR_TYPE_TRACK_COLORS,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingGaps } from '@/features/tours/domain/outing';
import { progressNearest, trackLines } from '@/features/tours/domain/route-metrics';
import { outingDetailMarkers } from '@/features/tours/domain/tour-detail-markers';

import {
  ARROW_BOTH_PREFIX,
  ARROW_PREFIX,
  FALLBACK_COLOR,
  MORE_MAX,
  MORE_PREFIX,
} from './marker-ids';
import type { LineProps, PointProps } from './tour-map';
import { stagesOf, type TourScene } from './tour-scene';

/**
 * The shapes the map draws around the tours (map-integration): the open tour's or outing's tracks,
 * straight legs, gaps, start, end and hand-overs; the closed outings' chains; and each marker's
 * name and the line under it.
 */
type Lines = GeoJSON.FeatureCollection<GeoJSON.LineString, LineProps>;
type Points = GeoJSON.FeatureCollection<GeoJSON.Point, PointProps>;
type Point = { lng: number; lat: number };

/** An outing's chain links: dark round dots (D8). */
const CHAIN_COLOR = '#1F2937';
/** Where a stage starts away from the previous one's finish: a dashed dark link. */
const GAP_COLOR = '#334155';

/** The activities' colours in `palette`, each once; a slate grey for none. */
const colorsOf = (types: readonly TourType[], palette: Record<TourType, string>) =>
  types.length ? distinctTypeColors(types, palette) : [NO_TYPE_COLOR];

/** Each closed outing as dotted arcs through its stages' goals, in order. */
export function chainLines(chains: TourScene['chains']): Lines['features'] {
  return chains.flatMap((chain) =>
    chain.slice(1).map((to, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: chainArc(chain[i]!, to) },
      properties: { color: CHAIN_COLOR, dotted: true },
    })),
  );
}

/** A loaded track by tour, kept with the file it came from; `null`: it would not load. */
type Tracks = Record<string, { path: string; lines: GeoJSON.Position[][] | null }>;

/**
 * The open tour's or outing's lines (activity-legs D5, tour-outings D16): each tour's GPX track in
 * its activities' track shades, switching to the way down's where it passes nearest the goal;
 * without one (or while it can't load), straight legs start → goal → end in the markers' colours,
 * with arrows; nothing while a track is still loading, so a straight line never flashes first. An
 * outing adds a dashed link wherever a stage starts away from the previous one's finish.
 */
export function useFocusLines(focus: readonly Tour[], outing: boolean): Lines {
  const [tracks, setTracks] = useState<Tracks>({});
  const files = focus.map((tour) => `${tour.id}:${tour.gpxFilepath ?? ''}`).join();
  useEffect(() => {
    let alive = true;
    for (const tour of focus) {
      const path = tour.gpxFilepath;
      if (!path) continue;
      const done = (lines: GeoJSON.Position[][] | null) => {
        if (alive) setTracks((prev) => ({ ...prev, [tour.id]: { path, lines } }));
      };
      void loadGpxTrack({ id: tour.id, gpxFilepath: path })
        .then((geojson) => done(geojson ? trackLines(geojson) : null))
        .catch(() => done(null));
    }
    return () => {
      alive = false;
    };
    // The tours' files, not a new array of the same tours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  return useMemo(() => {
    const features: Lines['features'] = [];
    const add = (bands: Band[], props: Omit<LineProps, 'color'>) =>
      bands.forEach((band) =>
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: band.coordinates },
          properties: { ...props, color: band.color },
        }),
      );
    for (const tour of focus) {
      const up = tour.legs?.ascent ?? tour.tourTypes;
      const down = tour.legs?.descent ?? tour.tourTypes;
      const track = tour.gpxFilepath ? tracks[tour.id] : undefined;
      if (tour.gpxFilepath && (!track || track.path !== tour.gpxFilepath)) continue;
      if (track?.lines?.length) {
        // One line splits at the goal; a track in pieces can't tell which piece is the way down.
        const [only] = track.lines;
        const split =
          tour.legs && only && track.lines.length === 1
            ? {
                at: progressNearest(only, tour.goal),
                colors: colorsOf(down, TOUR_TYPE_TRACK_COLORS),
              }
            : undefined;
        for (const line of track.lines) {
          add(bandLine(line, colorsOf(up, TOUR_TYPE_TRACK_COLORS), split), {
            width: outing ? 3 : 4,
            casing: true,
          });
        }
        continue;
      }
      for (const leg of connectorLegs(tour, up, down)) {
        add(bandLine(leg.coordinates, leg.colors), { width: 3, opacity: 0.85 });
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: leg.coordinates },
          properties: { color: leg.colors[0]!, width: 0, opacity: 0, arrow: leg.arrow },
        });
      }
    }
    if (outing) {
      for (const gap of outingGaps(focus)) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [gap.from.lng, gap.from.lat],
              [gap.to.lng, gap.to.lat],
            ],
          },
          properties: { color: GAP_COLOR, width: 2, dashed: true },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [focus, tracks, outing]);
}

/**
 * Straight legs start → goal → end of a tour without its track, in the markers' colours: the way
 * up's to the goal, the way down's from it. A round trip without separate ways is one leg with a
 * two-way arrow; a leg between coinciding points is dropped.
 */
function connectorLegs(
  tour: Tour,
  up: readonly TourType[],
  down: readonly TourType[],
): { coordinates: GeoJSON.Position[]; colors: string[]; arrow: string }[] {
  const { startPoint: start, endPoint: end, goal } = tour;
  const roundTrip = !tour.legs && !!start && !!end && isSameGoal(end, start);
  const leg = (a: Point | null, b: Point | null, types: readonly TourType[], both: boolean) => {
    if (!a || !b || isSameGoal(a, b)) return [];
    const colors = colorsOf(types, TOUR_TYPE_COLORS);
    const arrowColor = types.length ? colors[0]! : FALLBACK_COLOR;
    return [
      {
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
        colors,
        arrow: `${both ? ARROW_BOTH_PREFIX : ARROW_PREFIX}${arrowColor}`,
      },
    ];
  };
  return [...leg(start, goal, up, roundTrip), ...(roundTrip ? [] : leg(goal, end, down, false))];
}

/**
 * The open tour's start and end with their names (and the "+N" chip when other tours share its
 * spot), or the open outing's start, end and hand-over rings: the first start and last end, and
 * both sides of a gap, each named after its place, else "Startpunkt" / "Endpunkt".
 */
export function focusPoints(scene: TourScene, t: TFunction): Points {
  const features: Points['features'] = [];
  const point = (p: Point, properties: PointProps) =>
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties,
    });
  if (scene.segmentIds.length) {
    for (const marker of outingDetailMarkers(scene.focus)) {
      if (marker.pointKind === 'via') {
        const next = scene.focus.find(
          (s) => s.startPoint && isSameGoal(s.startPoint, marker.lngLat),
        );
        const type = next?.tourTypes[0];
        point(marker.lngLat, {
          kind: 'via',
          color: type ? TOUR_TYPE_COLORS[type] : FALLBACK_COLOR,
        });
        continue;
      }
      const start = marker.pointKind === 'start';
      const named = scene.focus.find((s) => {
        const p = start ? s.startPoint : s.endPoint;
        return p && isSameGoal(p, marker.lngLat) && (start ? s.startPointName : s.endPointName);
      });
      const name = start ? named?.startPointName : named?.endPointName;
      point(marker.lngLat, {
        kind: marker.pointKind,
        label: name ?? (start ? t('tours.form.startPointLabel') : t('tours.form.endPointLabel')),
      });
    }
    return { type: 'FeatureCollection', features };
  }
  const tour = scene.focus[0];
  if (tour?.startPoint) {
    point(tour.startPoint, {
      kind: 'start',
      ...(tour.startPointName ? { label: tour.startPointName } : {}),
    });
  }
  // A round trip's end is its start: one marker, one name.
  if (tour?.endPoint && !(tour.startPoint && isSameGoal(tour.endPoint, tour.startPoint))) {
    point(tour.endPoint, {
      kind: 'end',
      ...(tour.endPointName ? { label: tour.endPointName } : {}),
    });
  }
  if (scene.spot) {
    const others = scene.spot.ids.length - 1;
    point(
      { lng: scene.spot.at[0], lat: scene.spot.at[1] },
      {
        kind: 'more',
        image: `${MORE_PREFIX}${Math.min(others, MORE_MAX)}`,
        ids: scene.spot.ids.join(),
      },
    );
  }
  return { type: 'FeatureCollection', features };
}

/**
 * A marker's name and the line under it (D4): the stage ("Etappe 2/3"), the height, then the date
 * (the year only when it isn't this one), "Erledigt" or "Ohne Datum".
 */
export function useDescribeTour(all: readonly Tour[]) {
  const { t } = useTranslation();
  const { formatDateRange, formatElevation } = useFormatter();
  const stages = useMemo(() => stagesOf(all), [all]);
  return useMemo(
    () => (tour: Tour) => {
      const start = tour.plannedDate;
      const status = tour.completed
        ? t('map.marker.done')
        : start
          ? formatDateRange(start, tour.endDate ?? start, {
              day: 'numeric',
              month: 'short',
              ...(start.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
            })
          : t('map.marker.noDate');
      const stage = stages.get(tour.id);
      return {
        name: tour.name || t('tours.infoSheet.unnamedTour'),
        sub: [
          stage ? t('map.marker.stage', stage) : null,
          tour.elevation ? formatElevation(tour.elevation) : null,
          status,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    },
    [t, formatDateRange, formatElevation, stages],
  );
}
