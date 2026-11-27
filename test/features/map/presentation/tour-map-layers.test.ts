import {
  expression,
  latest,
  validateStyleMin,
  type ExpressionSpecification,
} from '@maplibre/maplibre-gl-style-spec';

import { markerDrawings } from '@/features/map/presentation/marker-ids';
import { CLUSTER_LAYER, tourMapLayers } from '@/features/map/presentation/tour-map-layers';

/** The cluster face a cluster of `count` tours asks the map for. */
function faceFor(count: number): string {
  const layer = tourMapLayers({ overlays: [], dimTrails: false }).tours.find(
    (l) => l.id === CLUSTER_LAYER,
  )!;
  const image = (layer.layout as { 'icon-image': ExpressionSpecification })['icon-image'];
  const parsed = expression.createExpression(image, latest.layout_symbol['icon-image'] as never);
  if (parsed.result !== 'success') throw new Error(JSON.stringify(parsed.value));
  return String(
    parsed.value.evaluate({ zoom: 8 }, {
      type: 'Point',
      properties: { point_count: count },
    } as never),
  );
}

describe('cluster faces', () => {
  const drawn = new Set(markerDrawings().map(([id]) => id));

  it.each([2, 9, 10, 99])('should have a face drawn for a cluster of %i', (count) => {
    expect(drawn.has(faceFor(count))).toBe(true);
  });

  it('should show 99+ for any larger cluster, never a face that was not drawn', () => {
    expect(faceFor(100)).toBe('cluster-face|99+');
    expect(faceFor(2500)).toBe('cluster-face|99+');
    expect(drawn.has(faceFor(2500))).toBe(true);
  });
});

/** The done chip a cluster of `count` tours, `done` of them done, asks the map for. */
function doneChipFor(count: number, done: number): string {
  const layer = tourMapLayers({ overlays: [], dimTrails: false }).tours.find(
    (l) => l.id === 'tour-cluster-done',
  )!;
  const image = (layer.layout as { 'icon-image': ExpressionSpecification })['icon-image'];
  const parsed = expression.createExpression(image, latest.layout_symbol['icon-image'] as never);
  if (parsed.result !== 'success') throw new Error(JSON.stringify(parsed.value));
  return String(
    parsed.value.evaluate({ zoom: 8 }, {
      type: 'Point',
      properties: { point_count: count, doneW: done },
    } as never),
  );
}

describe('cluster done chips', () => {
  const drawn = new Set(markerDrawings().map(([id]) => id));

  it('should show the check alone when every tour of the cluster is done', () => {
    expect(doneChipFor(3, 3)).toBe('done|all');
    expect(drawn.has('done|all')).toBe(true);
  });

  it.each([
    [10, 3],
    [200, 99],
    [500, 150],
  ])('should have a chip drawn for %i tours, %i done', (count, done) => {
    expect(drawn.has(doneChipFor(count, done))).toBe(true);
  });
});

describe('layer stack', () => {
  it('should be a valid style for every source the map adds', () => {
    const layers = tourMapLayers({ overlays: [], dimTrails: false });
    const geojson = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
    const style = {
      version: 8,
      glyphs: 'https://example.com/{fontstack}/{range}.pbf',
      sources: {
        lines: geojson,
        tours: { ...geojson, cluster: true },
        points: geojson,
        focus: geojson,
        labels: geojson,
        'focus-names': geojson,
        footprints: geojson,
        areas: geojson,
      },
      layers: [
        ...layers.areas,
        ...layers.lines,
        ...layers.tours,
        ...layers.points,
        ...layers.focus,
        ...layers.labels,
        ...layers.focusNames,
        ...layers.footprints,
      ],
    };
    expect(validateStyleMin(style as never)).toEqual([]);
  });

  it('should never let the open tour or outing cluster or hide its names when zoomed out', () => {
    const { focus } = tourMapLayers({ overlays: [], dimTrails: false });
    const { focusNames } = tourMapLayers({ overlays: [], dimTrails: false });
    expect(focus.every((l) => 'source' in l && l.source === 'focus')).toBe(true);
    expect(focusNames.map((l) => l.id)).toEqual(['focus-labels']);
    expect(focusNames[0]!.minzoom).toBeUndefined();
  });

  it('should have a number badge drawn for each stage of a long outing', () => {
    const drawn = new Set(markerDrawings().map(([id]) => id));
    for (let n = 1; n <= 30; n++) expect(drawn.has(`segment|${n}`)).toBe(true);
  });
});

describe('outing chains', () => {
  const { lines } = tourMapLayers({ overlays: [], dimTrails: false });
  const drawnBy = (id: string, properties: Record<string, unknown>) => {
    const layer = lines.find((l) => l.id === id) as { filter: ExpressionSpecification };
    const filter = expression.createExpression(layer.filter, {
      type: 'boolean',
    } as never);
    if (filter.result !== 'success') throw new Error(JSON.stringify(filter.value));
    return filter.value.evaluate({ zoom: 12 }, { type: 'LineString', properties } as never);
  };

  it('should draw a chain as dots only, never as a solid line under them', () => {
    expect(drawnBy('line', { color: '#1F2937', dotted: true })).toBe(false);
    expect(drawnBy('line-dots', { color: '#1F2937', dotted: true })).toBe(true);
  });

  it('should keep drawing a track as a solid line', () => {
    expect(drawnBy('line', { color: '#c00', width: 4 })).toBe(true);
    expect(drawnBy('line-dots', { color: '#c00', width: 4 })).toBe(false);
  });
});

describe('trail overlays', () => {
  const overlay = (layers: ReturnType<typeof tourMapLayers>, id: string) =>
    layers.overlays.find((layer) => layer.id === `overlay-${id}`)!;
  const ski = (layers: ReturnType<typeof tourMapLayers>, id: string) =>
    layers.ski.find((layer) => layer.id === id)!;

  it('should load nothing for an overlay that is off and not at hand', () => {
    const layers = tourMapLayers({ overlays: [], dimTrails: false });

    expect(overlay(layers, 'hiking').layout).toMatchObject({ visibility: 'none' });
    expect(ski(layers, 'ski-halo').layout).toMatchObject({ visibility: 'none' });
    expect(ski(layers, 'ski-badges').layout).toMatchObject({ visibility: 'none' });
  });

  it('should load an overlay that is off but at hand, unseen, its badges kept out', () => {
    const layers = tourMapLayers({ overlays: [], dimTrails: false, warm: true });

    expect(overlay(layers, 'hiking')).toMatchObject({
      layout: { visibility: 'visible' },
      paint: { 'raster-opacity': 0 },
    });
    expect(ski(layers, 'ski-halo')).toMatchObject({
      layout: { visibility: 'visible' },
      paint: { 'line-opacity': 0 },
    });
    // A placed badge would push other labels aside even unseen.
    expect(ski(layers, 'ski-badges').layout).toMatchObject({ visibility: 'none' });
  });

  it('should show an overlay that is on, dimmed while a track is drawn', () => {
    const on = tourMapLayers({ overlays: ['hiking', 'ski'], dimTrails: false, warm: true });
    const dimmed = tourMapLayers({ overlays: ['hiking'], dimTrails: true });

    expect(overlay(on, 'hiking').paint).toMatchObject({ 'raster-opacity': 1 });
    expect(ski(on, 'ski-halo').paint).toMatchObject({ 'line-opacity': 0.5 });
    expect(ski(on, 'ski-badges').layout).toMatchObject({ visibility: 'visible' });
    expect(overlay(dimmed, 'hiking').paint).toMatchObject({ 'raster-opacity': 0.4 });
  });

  it('should be valid style for MapLibre, transitions included', () => {
    const layers = tourMapLayers({ overlays: ['ski'], dimTrails: false, warm: true });
    const style = {
      version: 8 as const,
      sources: {
        'overlay-hiking': { type: 'raster' as const, tiles: ['https://x/{z}/{x}/{y}.png'] },
        'overlay-ski': { type: 'raster' as const, tiles: ['https://x/{z}/{x}/{y}.png'] },
        'ski-routes': { type: 'vector' as const, tiles: ['https://x/{z}/{x}/{y}.pbf'] },
      },
      layers: [...layers.overlays, ...layers.ski],
    };

    expect(validateStyleMin(style as never)).toEqual([]);
  });
});
