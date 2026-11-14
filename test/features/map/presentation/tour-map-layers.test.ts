import { expression, latest, type ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

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
