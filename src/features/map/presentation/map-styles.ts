import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';

/**
 * The base maps (map-integration): the PWA offers Swisstopo's vector base map and the classic
 * pixel map (WMTS). The classic one has no style document of its own, so it is built here.
 */
export type BaseStyle = {
  labelKey: 'map.styles.base' | 'map.styles.classic';
  style: string | StyleSpecification;
  thumbnail: number;
};

export const BASE_MAP_URL =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json';

const CLASSIC: StyleSpecification = {
  version: 8,
  glyphs: 'https://vectortiles.geo.admin.ch/fonts/{fontstack}/{range}.pbf',
  sources: {
    'swisstopo-wmts': {
      type: 'raster',
      tiles: [
        'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
      ],
      tileSize: 256,
      attribution: '© swisstopo',
      maxzoom: 25,
    },
  },
  layers: [{ id: 'swisstopo-wmts-layer', source: 'swisstopo-wmts', type: 'raster' }],
};

export const BASE_STYLES: BaseStyle[] = [
  {
    labelKey: 'map.styles.base',
    style: BASE_MAP_URL,
    thumbnail: require('../../../../assets/images/map-layers/base.png'),
  },
  {
    labelKey: 'map.styles.classic',
    style: CLASSIC,
    thumbnail: require('../../../../assets/images/map-layers/classic.png'),
  },
];
