/**
 * A bowed arc from `a` to `b` (tour-outings D8, the PWA's `chainArc`): a schematic link between two
 * stages' goals. A straight line between goals reads as the route itself, and crosses glaciers and
 * lakes the route doesn't.
 */
export function chainArc(a: [number, number], b: [number, number], steps = 16): [number, number][] {
  // A locally square frame: a degree of longitude is shorter than one of latitude.
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dx = (b[0] - a[0]) * k;
  const dy = b[1] - a[1];
  // The control point: the midpoint pushed sideways by a fifth of the distance (clockwise bow).
  const cx = (a[0] + b[0]) / 2 + (dy * 0.2) / k;
  const cy = (a[1] + b[1]) / 2 - dx * 0.2;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [
      u * u * a[0] + 2 * u * t * cx + t * t * b[0],
      u * u * a[1] + 2 * u * t * cy + t * t * b[1],
    ];
  });
}
