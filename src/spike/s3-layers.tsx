import { GeoJSONSource, type GeoJSONSourceRef, Layer, LogManager, RasterSource, VectorSource } from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Ref } from 'react';
import { fixtureTours } from './fixture-tours';
import {
  BUCKET_COLORS,
  CLUSTER_FACE,
  CLUSTER_SHADOW,
  GRADE_COLOR_EXPRESSION,
  PIE_STEPS,
  SKI_BADGE_PREFIX,
  WEDGE_PREFIX,
} from './marker-images';
import { SKI_ROUTES_TILEJSON } from './offline';
import type { LngLat } from './vendor/trail';

/** Hit-test targets for `queryRenderedFeatures`. */
export const CLUSTER_LAYER = 'tour-clusters';
export const TOUR_LAYERS = ['tour-circles', 'tour-pies'];
export const SKI_HALO_LAYER = 'ski-halo';

export const TOURS = fixtureTours();
const wmts = (layer: string) => `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.png`;
const LINE = { 'line-join': 'round', 'line-cap': 'round' } as const;
const OVERLAP = { 'icon-allow-overlap': true, 'icon-ignore-placement': true } as const;
const IS_CLUSTER: ExpressionSpecification = ['has', 'point_count'];
const NOT_CLUSTER: ExpressionSpecification = ['!', IS_CLUSTER];

// WMTS answers 400 for tiles outside Switzerland's extent; the PWA swallows them with a
// `map.on('error')` listener, here they would flood LogBox. Swallow those, log the rest.
LogManager.onLog(({ message }) => /source overlay-\w+: HTTP status code 400/.test(message));

/**
 * Whole steps (of 24) of the cluster's tours in the buckets before `i`. Each wedge spans
 * `before(i + 1) - before(i)`: rounded cumulative shares telescope, so wedges always fill 24 steps.
 */
function before(i: number): ExpressionSpecification | number {
  if (i === 0) return 0;
  const sum = BUCKET_COLORS.slice(0, i).map((_, j): ExpressionSpecification => ['get', `w${j}`]);
  return ['round', ['*', PIE_STEPS, ['/', sum.length > 1 ? ['+', ...sum] : sum[0], ['get', 'point_count']]]] as ExpressionSpecification;
}

export interface S3LayerProps {
  hiking: boolean;
  ski: boolean;
  /** Trails step back while a track is drawn (same as the PWA). */
  dimmed: boolean;
  track: LngLat[];
  toursRef: Ref<GeoJSONSourceRef>;
}

/**
 * The PWA's layer stack, bottom → top: hiking raster → ski halo → ski raster → ski badges → drawn
 * track → tours. Overlays toggle `visibility` and are never unmounted, so the order never changes.
 */
export function S3Layers({ hiking, ski, dimmed, track, toursRef }: S3LayerProps) {
  const raster = { 'raster-opacity': dimmed ? 0.4 : 1 };
  const skiVisibility = ski ? 'visible' : 'none';
  return (
    <>
      <RasterSource id="overlay-hiking" tiles={[wmts('ch.swisstopo.swisstlm3d-wanderwege')]} tileSize={256} maxzoom={18}>
        <Layer id="overlay-hiking" type="raster" layout={{ visibility: hiking ? 'visible' : 'none' }} paint={raster} />
      </RasterSource>
      <VectorSource id="ski-routes" url={SKI_ROUTES_TILEJSON}>
        <Layer
          id={SKI_HALO_LAYER}
          type="line"
          source-layer="routes"
          minzoom={11}
          layout={{ ...LINE, visibility: skiVisibility }}
          paint={{ 'line-color': GRADE_COLOR_EXPRESSION, 'line-width': 10, 'line-opacity': dimmed ? 0.2 : 0.5, 'line-blur': 2 }}
        />
      </VectorSource>
      <RasterSource id="overlay-ski" tiles={[wmts('ch.swisstopo-karto.skitouren')]} tileSize={256} maxzoom={17}>
        <Layer id="overlay-ski" type="raster" layout={{ visibility: skiVisibility }} paint={raster} />
      </RasterSource>
      <Layer
        id="ski-badges"
        type="symbol"
        source="ski-routes"
        source-layer="routes"
        minzoom={11}
        layout={{
          'visibility': skiVisibility,
          'icon-image': ['concat', SKI_BADGE_PREFIX, ['coalesce', ['get', 'difficulty_de'], '']],
          'symbol-placement': 'line',
          'symbol-spacing': 220,
          'icon-rotation-alignment': 'viewport',
          'icon-padding': 4,
        }}
      />

      <GeoJSONSource
        id="track"
        data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: track.length > 1 ? track : [] } }}
      >
        <Layer id="track-casing" type="line" layout={LINE} paint={{ 'line-color': '#ffffff', 'line-width': 7 }} />
        <Layer id="track-line" type="line" layout={LINE} paint={{ 'line-color': '#E11D48', 'line-width': 4 }} />
      </GeoJSONSource>

      <GeoJSONSource
        ref={toursRef}
        id="tours"
        data={TOURS}
        cluster
        clusterRadius={50}
        // Full reduce form: iOS turns each array element into an NSExpression, so GL JS's shorthand
        // `['+', ['get', 'w0']]` arrives as the string "+" and the clusters never get their sums.
        clusterProperties={Object.fromEntries(BUCKET_COLORS.map((_, i) => [
          `w${i}`,
          [['+', ['accumulated'], ['get', `w${i}`]], ['get', `w${i}`]],
        ]))}
      >
        <Layer
          id="tour-circles"
          type="circle"
          filter={NOT_CLUSTER}
          paint={{
            'circle-radius': 14,
            'circle-color': ['case', ['has', 'pie'], 'rgba(0,0,0,0)', ['get', 'color']],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
          }}
        />
        <Layer
          id="tour-pies"
          type="symbol"
          filter={['all', NOT_CLUSTER, ['has', 'pie']]}
          layout={{ 'icon-image': ['get', 'pie'], ...OVERLAP }}
        />
        <Layer id="tour-cluster-shadow" type="symbol" filter={IS_CLUSTER} layout={{ 'icon-image': CLUSTER_SHADOW, ...OVERLAP }} />
        {BUCKET_COLORS.map((_, i) => {
          const steps = ['-', before(i + 1), before(i)] as ExpressionSpecification;
          return (
            <Layer
              key={i}
              id={`tour-cluster-wedge-${i}`}
              type="symbol"
              filter={['all', IS_CLUSTER, ['>', steps, 0]]}
              layout={{
                'icon-image': ['concat', `${WEDGE_PREFIX}${i}|`, ['to-string', steps]],
                'icon-rotate': ['*', 360 / PIE_STEPS, before(i)],
                'icon-rotation-alignment': 'viewport',
                ...OVERLAP,
              }}
            />
          );
        })}
        <Layer
          id={CLUSTER_LAYER}
          type="symbol"
          filter={IS_CLUSTER}
          layout={{
            'icon-image': CLUSTER_FACE,
            ...OVERLAP,
            'text-field': ['to-string', ['get', 'point_count']],
            'text-font': ['Frutiger Neue Medium'],
            'text-size': ['step', ['get', 'point_count'], 12, 100, 10],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{ 'text-color': '#1c1917' }}
        />
      </GeoJSONSource>
    </>
  );
}
