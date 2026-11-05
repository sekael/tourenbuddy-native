import { GeoJSONSource, type GeoJSONSourceRef, Layer, RasterSource, VectorSource } from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Ref } from 'react';
import { fixtureTours } from './fixture-tours';
import { BUCKET_COLORS, CLUSTER_PREFIX, GRADE_COLOR_EXPRESSION, PIE_STEPS, SKI_BADGE_PREFIX } from './marker-images';
import { SKI_ROUTES_TILEJSON } from './offline';
import type { LngLat } from './vendor/trail';

/** Hit-test targets for `queryRenderedFeatures`. */
export const CLUSTER_LAYER = 'tour-clusters';
export const TOUR_LAYERS = ['tour-circles', 'tour-pies'];
export const SKI_HALO_LAYER = 'ski-halo';

const TOURS = fixtureTours();
const wmts = (layer: string) => `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.png`;
const LINE = { 'line-join': 'round', 'line-cap': 'round' } as const;
const NOT_CLUSTER: ExpressionSpecification = ['!', ['has', 'point_count']];

// Each bucket's share of the cluster, in 24ths: `cluster|3,0,21,0,0,0,0`.
const CLUSTER_IMAGE = [
  'concat',
  CLUSTER_PREFIX,
  ...BUCKET_COLORS.flatMap((_, i) => [
    i ? ',' : '',
    ['to-string', ['round', ['*', PIE_STEPS, ['/', ['get', `w${i}`], ['get', 'point_count']]]]],
  ]),
] as ExpressionSpecification;

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
        clusterProperties={Object.fromEntries(BUCKET_COLORS.map((_, i) => [`w${i}`, ['+', ['get', `w${i}`]]]))}
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
          layout={{ 'icon-image': ['get', 'pie'], 'icon-allow-overlap': true, 'icon-ignore-placement': true }}
        />
        <Layer
          id={CLUSTER_LAYER}
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'icon-image': CLUSTER_IMAGE,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
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
