// Ported from the PWA's features/map/presentation/components/pie-marker.ts (port-pwa-web): MapLibre GL JS on the web.
import type { TourType } from '@/features/tours/data/models/tour-type';
import { distinctTypeColors } from '@/features/tours/data/models/tour-type';

export const MARKER_RADIUS = 18;
export const MARKER_SIZE = MARKER_RADIUS * 2;

/** Slice weights keyed by colour (not by type): types sharing a colour share a slice. */
export type CountMap = Record<string, number>;
export const FALLBACK_COLOR = '#78716C';
const PIE_IMAGE_PREFIX = 'pie:';

/** A tour's marker colours — its distinct type colours, or the neutral fallback when untyped. */
export function tourColors(
  types: readonly TourType[],
  palette: Record<TourType, string>,
  fallback: string = FALLBACK_COLOR,
): string[] {
  const colors = distinctTypeColors(types, palette);
  return colors.length ? colors : [fallback];
}

/** A tour weighs 1 in a cluster pie, split evenly across its colours (#335). */
export function addTourWeight(counts: CountMap, colors: readonly string[]): void {
  for (const color of colors) counts[color] = (counts[color] ?? 0) + 1 / colors.length;
}

export { cssFill } from '@/features/tours/data/models/tour-type';

/**
 * MapLibre image id of a split marker, or null for a single colour. The colours ARE the id, so
 * a `styleimagemissing` handler can draw any combination on demand with no registry.
 */
export function pieImageId(colors: readonly string[]): string | null {
  return colors.length > 1 ? `${PIE_IMAGE_PREFIX}${colors.join(',')}` : null;
}

/** Colours encoded in a {@link pieImageId}, or null for any other image id. */
export function pieImageColors(id: string): string[] | null {
  return id.startsWith(PIE_IMAGE_PREFIX) ? id.slice(PIE_IMAGE_PREFIX.length).split(',') : null;
}

/** Raster pie (equal slices, clockwise from 12 o'clock) for a MapLibre symbol; null without canvas. */
export function drawPieImage(
  colors: readonly string[],
  radius: number,
  pixelRatio: number,
): ImageData | null {
  const size = Math.ceil(radius * 2 * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = size / 2;
  const slice = (2 * Math.PI) / colors.length;
  colors.forEach((color, i) => {
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, c, -Math.PI / 2 + i * slice, -Math.PI / 2 + (i + 1) * slice);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  });
  return ctx.getImageData(0, 0, size, size);
}

const SEGMENT_BADGE_PREFIX = 'segment:';
/** Logical diameter of an outing segment's number badge. */
const SEGMENT_BADGE_SIZE = 18;

/** Image id of the badge numbering an outing's segment `n` (1-based, design D16). */
export function segmentBadgeId(n: number): string {
  return `${SEGMENT_BADGE_PREFIX}${n}`;
}

/** The segment number a badge image id encodes; null for ids this module does not own. */
export function segmentBadgeNumber(id: string): number | null {
  if (!id.startsWith(SEGMENT_BADGE_PREFIX)) return null;
  const n = Number(id.slice(SEGMENT_BADGE_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Dark disc, white ring, white number — drawn, so raster base styles without glyphs work too. */
export function drawSegmentBadge(n: number, pixelRatio: number): ImageData | null {
  const size = Math.ceil(SEGMENT_BADGE_SIZE * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const c = size / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - pixelRatio, 0, 2 * Math.PI);
  ctx.fillStyle = '#1F2937';
  ctx.fill();
  ctx.lineWidth = 1.5 * pixelRatio;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${(n > 9 ? 9 : 11) * pixelRatio}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), c, c + 0.5 * pixelRatio);
  return ctx.getImageData(0, 0, size, size);
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [sx, sy] = polarToCartesian(cx, cy, r, startDeg);
  const [ex, ey] = polarToCartesian(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey} Z`;
}

/** Computes SVG path + color pairs for a pie chart. Returns empty array when total is 0. */
export function buildSlices(counts: CountMap, total: number): { path: string; color: string }[] {
  if (total === 0) return [];

  const cx = MARKER_RADIUS;
  const cy = MARKER_RADIUS;
  const r = MARKER_RADIUS;

  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  if (entries.length === 0) return [];

  // Single type — full circle (avoid degenerate arc path)
  if (entries.length === 1) {
    const [color] = entries[0]!;
    return [
      {
        path: `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 -${r * 2} 0`,
        color,
      },
    ];
  }

  const slices: { path: string; color: string }[] = [];
  let currentAngle = 0;

  for (const [color, count] of entries) {
    const sliceAngle = (count / total) * 360;
    const endAngle = currentAngle + sliceAngle;
    const path = describeArc(cx, cy, r, currentAngle, endAngle);
    slices.push({ path, color });
    currentAngle = endAngle;
  }

  return slices;
}

function buildSvgElement(counts: CountMap, total: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(MARKER_SIZE));
  svg.setAttribute('height', String(MARKER_SIZE));
  svg.setAttribute('viewBox', `0 0 ${MARKER_SIZE} ${MARKER_SIZE}`);

  const slices = buildSlices(counts, total);
  for (const { path, color } of slices) {
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('fill', color);
    svg.appendChild(pathEl);
  }

  // White outline sets the cluster apart from the base map (D10).
  const outline = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  outline.setAttribute('cx', String(MARKER_RADIUS));
  outline.setAttribute('cy', String(MARKER_RADIUS));
  outline.setAttribute('r', String(MARKER_RADIUS - 1));
  outline.setAttribute('fill', 'none');
  outline.setAttribute('stroke', 'white');
  outline.setAttribute('stroke-width', '2');
  svg.appendChild(outline);

  // White backdrop disc for count label readability; the ring around it carries the mix.
  const backdropR = 9;
  const cx = MARKER_RADIUS;
  const cy = MARKER_RADIUS;
  const backdrop = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  backdrop.setAttribute('cx', String(cx));
  backdrop.setAttribute('cy', String(cy));
  backdrop.setAttribute('r', String(backdropR));
  backdrop.setAttribute('fill', 'white');
  backdrop.setAttribute('fill-opacity', '0.95');
  svg.appendChild(backdrop);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(cx));
  text.setAttribute('y', String(cy));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('font-size', total >= 100 ? '10' : '12');
  text.setAttribute('font-weight', '600');
  text.setAttribute('font-family', 'Inter, sans-serif');
  text.setAttribute('fill', '#1c1917');
  text.textContent = String(total);
  svg.appendChild(text);

  return svg;
}

export interface PieMarkerResult {
  element: HTMLElement;
  update: (counts: CountMap, total: number, done?: number) => void;
}

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true"><polyline points="4.5,12.5 9.5,17.5 19.5,7" stroke="white" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Green corner badge of a cluster's completed tours: ✓ alone when all are done, else ✓ + count. */
function renderDoneBadge(badge: HTMLElement, done: number, total: number): void {
  // `display`, not the `hidden` attribute: the badge's inline `display:flex` would override it.
  badge.style.display = done === 0 ? 'none' : 'flex';
  badge.innerHTML = done === total ? CHECK_SVG : `${CHECK_SVG}<span>${done}</span>`;
}

/**
 * Creates a pie-chart SVG element for a cluster marker.
 * Returns the wrapper element and an update function for in-place mutation.
 */
export function fadeIn(el: HTMLElement): void {
  requestAnimationFrame(() => {
    el.style.opacity = '1';
  });
}

export function fadeOut(el: HTMLElement, onDone: () => void): void {
  if (el.style.opacity === '0') {
    onDone();
    return;
  }

  let done = false;
  let timer: ReturnType<typeof setTimeout>;
  const handler = (e: Event) => {
    if (e.target === el) fire();
  };
  function fire() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    el.removeEventListener('transitionend', handler);
    onDone();
  }

  el.addEventListener('transitionend', handler);
  el.style.opacity = '0';
  timer = setTimeout(fire, 250);
}

export function createPieMarkerElement(counts: CountMap, total: number, done = 0): PieMarkerResult {
  const wrapper = document.createElement('div');
  // No inline `position`: MapLibre's marker class makes the element absolute (the badge's anchor).
  wrapper.style.cssText =
    'cursor:pointer;opacity:0;transition:opacity 200ms ease;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));';

  let currentSvg = buildSvgElement(counts, total);
  wrapper.appendChild(currentSvg);
  // Status at a glance (round-3 review): how many of the cluster's tours are already done.
  const badge = document.createElement('span');
  badge.className = 'cluster-done';
  badge.style.cssText =
    'position:absolute;right:-6px;bottom:-4px;align-items:center;gap:1px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;justify-content:center;border:1.5px solid white;border-radius:8px;background:#15803D;color:white;font:600 9px/1 Inter,system-ui,sans-serif;';
  renderDoneBadge(badge, done, total);
  wrapper.appendChild(badge);

  function update(newCounts: CountMap, newTotal: number, newDone = 0) {
    const newSvg = buildSvgElement(newCounts, newTotal);
    wrapper.replaceChild(newSvg, currentSvg);
    currentSvg = newSvg;
    renderDoneBadge(badge, newDone, newTotal);
  }

  return { element: wrapper, update };
}
