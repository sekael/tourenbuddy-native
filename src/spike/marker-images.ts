import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { ImageEntry } from '@maplibre/maplibre-react-native';
import { BlurStyle, matchFont, PaintStyle, Skia, type SkCanvas, TileMode } from '@shopify/react-native-skia';
import { PixelRatio, Platform } from 'react-native';
import { skiDifficultyGrade } from './vendor/ski-difficulty';

/**
 * RN has no <canvas>: Skia draws offscreen → PNG data URI → MapLibre `Images`. Unlike the web's
 * `styleimagemissing`, a native map asks for a missing image synchronously and never asks again,
 * so an id JS adds later stays blank until its tile reloads. Every id a layer can ask for is
 * therefore drawn up front: a finite, known set (`registeredImages`). The web keeps the canvas code.
 */

/** Colour buckets of TOUR_TYPE_COLORS (types sharing a colour share a bucket); last = untyped. */
export const BUCKET_COLORS = ['#0284C7', '#4338CA', '#D97706', '#E11D48', '#9A3412', '#86198F', '#78716C'];
/** A cluster pie is 24 steps of 15°: one wedge image per bucket and size, rotated into place by its layer. */
export const PIE_STEPS = 24;
export const PIE_PREFIX = 'pie|';
export const WEDGE_PREFIX = 'wedge|';
export const CLUSTER_SHADOW = 'cluster-shadow';
export const CLUSTER_FACE = 'cluster-face';
export const SKI_BADGE_PREFIX = 'ski-badge|';
const CLUSTER_RADIUS = 18;
const CLUSTER_SIZE = CLUSTER_RADIUS * 2 + 4; // room for the shadow

const RATIO = Math.max(2, Math.ceil(PixelRatio.get()));
export const drawStats = { count: 0, totalMs: 0, maxMs: 0 };

function render(width: number, height: number, draw: (canvas: SkCanvas) => void): ImageEntry {
  const t0 = performance.now();
  const surface = Skia.Surface.Make(Math.ceil(width * RATIO), Math.ceil(height * RATIO))!;
  const canvas = surface.getCanvas();
  canvas.scale(RATIO, RATIO);
  draw(canvas);
  surface.flush();
  const uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
  const ms = performance.now() - t0;
  drawStats.count++;
  drawStats.totalMs += ms;
  drawStats.maxMs = Math.max(drawStats.maxMs, ms);
  return { source: { uri, scale: RATIO } };
}

const fill = (color: string) => {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  return paint;
};

/** A tour of several colours: equal slices clockwise from 12 o'clock (`weights` 0/1 per bucket). */
function drawPie(weights: number[], radius: number): ImageEntry {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return render(radius * 2, radius * 2, (canvas) => {
    const oval = Skia.XYWHRect(0, 0, radius * 2, radius * 2);
    let angle = -90;
    weights.forEach((w, i) => {
      if (!w) return;
      const sweep = (w / total) * 360;
      canvas.drawArc(oval, angle, sweep, true, fill(BUCKET_COLORS[i]!));
      angle += sweep;
    });
  });
}

/** One bucket's wedge: `steps` × 15° clockwise from 12 o'clock, apex at the image centre. */
function drawWedge(bucket: number, steps: number): ImageEntry {
  return render(CLUSTER_SIZE, CLUSTER_SIZE, (canvas) => {
    const c = CLUSTER_SIZE / 2;
    const oval = Skia.XYWHRect(c - CLUSTER_RADIUS, c - CLUSTER_RADIUS, CLUSTER_RADIUS * 2, CLUSTER_RADIUS * 2);
    // 1° under the next wedge (a layer above) hides the anti-aliased seam between the two.
    canvas.drawArc(oval, -90, Math.min(360, (steps * 360) / PIE_STEPS + 1), true, fill(BUCKET_COLORS[bucket]!));
  });
}

/** Below the wedges the soft shadow; above them the white ring and the count's backdrop. */
function drawClusterFrame(face: boolean): ImageEntry {
  return render(CLUSTER_SIZE, CLUSTER_SIZE, (canvas) => {
    const c = CLUSTER_SIZE / 2;
    if (!face) {
      const shadow = fill('#000000');
      shadow.setAlphaf(0.35);
      shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 1.5, true));
      canvas.drawCircle(c, c + 1, CLUSTER_RADIUS, shadow);
      return;
    }
    const ring = fill('#ffffff');
    ring.setStyle(PaintStyle.Stroke);
    ring.setStrokeWidth(2);
    canvas.drawCircle(c, c, CLUSTER_RADIUS - 1, ring);
    const backdrop = fill('#ffffff');
    backdrop.setAlphaf(0.95);
    canvas.drawCircle(c, c, 9, backdrop);
  });
}

// --- Ski badges: port of ski-badge.ts `drawBadge` (canvas → Skia, same geometry) ---

const GRADE_COLORS = ['#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#9333ea', '#6b21a8', '#3b0764'];
const NO_DIFFICULTY_COLOR = '#78716c';
const SKIER_PATH = 'M18.5 23q-.65 0-1.263-.1t-1.187-.3L2 17.475l.5-1.425l6.9 2.525l1.725-4.45L7.55 10.4q-.675-.7-.537-1.662T8 7.275l3.475-2q.425-.25.863-.288t.862.138q.425.15.738.475t.462.775l.325 1.075q.325 1.075 1.063 1.9t1.762 1.25l.525-1.6l1.425.45l-1.125 3.45q-1.85-.3-3.275-1.45T13 8.6l-2.525 1.45L13.5 13.5l-2.225 5.75l3.1 1.125l2.1-6.425q.35.125.7.225t.725.175l-2.125 6.55l.775.275q.45.15.938.237t1.012.088q.65 0 1.238-.125T20.875 21L22 22.125q-.8.425-1.675.65T18.5 23M15.088 5.913Q14.5 5.325 14.5 4.5t.588-1.412T16.5 2.5t1.413.588T18.5 4.5t-.587 1.413T16.5 6.5t-1.412-.587';
const HEIGHT = 24;
const RING = 2;
const SHADOW = 4;
const font = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
  fontSize: 12,
  fontWeight: '600',
});
const skier = Skia.Path.MakeFromSVGString(SKIER_PATH)!;

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

function gradeColor(grade: number | null): string {
  if (grade === null) return NO_DIFFICULTY_COLOR;
  const pos = Math.min(Math.max((grade - 1) / 3, 0), GRADE_COLORS.length - 1);
  const i = Math.floor(pos);
  return i === GRADE_COLORS.length - 1 ? GRADE_COLORS[i]! : mix(GRADE_COLORS[i]!, GRADE_COLORS[i + 1]!, pos - i);
}

/** Same stops as `gradeColor`, as a style expression over the route's numeric `grade`. */
export const GRADE_COLOR_EXPRESSION = [
  'case',
  ['==', ['typeof', ['get', 'grade']], 'number'],
  ['interpolate', ['linear'], ['get', 'grade'], ...GRADE_COLORS.flatMap((color, i) => [1 + i * 3, color])],
  NO_DIFFICULTY_COLOR,
] as ExpressionSpecification;

function drawBadge(label: string, color: string): ImageEntry {
  const textWidth = label ? Math.ceil(font.measureText(label).width) : 0;
  const pill = label ? 6 + 14 + 4 + textWidth + 9 : HEIGHT;
  return render(pill + 2 * SHADOW, HEIGHT + 2 * SHADOW, (canvas) => {
    const x = SHADOW;
    const y = SHADOW - 1;
    const white = fill('#ffffff');
    const shadowed = fill('#ffffff');
    shadowed.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, 1, SHADOW / 2, SHADOW / 2, Skia.Color('rgba(15, 23, 42, 0.35)')));
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, pill, HEIGHT), HEIGHT / 2, HEIGHT / 2), shadowed);

    const gradient = fill(color);
    gradient.setShader(Skia.Shader.MakeLinearGradient(
      { x: 0, y },
      { x: 0, y: y + HEIGHT },
      [Skia.Color(mix(color, '#ffffff', 0.18)), Skia.Color(color)],
      null,
      TileMode.Clamp,
    ));
    const inner = Skia.XYWHRect(x + RING, y + RING, pill - 2 * RING, HEIGHT - 2 * RING);
    canvas.drawRRect(Skia.RRectXY(inner, HEIGHT / 2 - RING, HEIGHT / 2 - RING), gradient);

    const glyph = 14;
    canvas.save();
    canvas.translate(label ? x + 6 : x + (pill - glyph) / 2, y + (HEIGHT - glyph) / 2);
    canvas.scale(glyph / 24, glyph / 24);
    canvas.drawPath(skier, white);
    canvas.restore();

    if (label) {
      const { ascent, descent } = font.getMetrics();
      canvas.drawText(label, x + 6 + glyph + 4, y + HEIGHT / 2 + 0.5 - (ascent + descent) / 2, white, font);
    }
  });
}

/** The whole SAC ski-touring scale (German letters, as `difficulty_de`), modifiers included. */
const SAC_GRADES = ['L', 'WS', 'ZS', 'S', 'SS', 'AS', 'EX'].flatMap(g => [`${g}-`, g, `${g}+`]);

/** Every image the layers can ask for: cluster wedges + frame, all ski badges, the given tour pies. */
export function registeredImages(pieIds: Iterable<string>): Record<string, ImageEntry> {
  const images: Record<string, ImageEntry> = {
    [CLUSTER_SHADOW]: drawClusterFrame(false),
    [CLUSTER_FACE]: drawClusterFrame(true),
  };
  BUCKET_COLORS.forEach((_, b) => {
    for (let n = 1; n <= PIE_STEPS; n++) images[`${WEDGE_PREFIX}${b}|${n}`] = drawWedge(b, n);
  });
  for (const label of ['', ...SAC_GRADES])
    images[SKI_BADGE_PREFIX + label] = drawBadge(label, gradeColor(skiDifficultyGrade(label || null)));
  for (const id of pieIds) images[id] = drawPie(id.slice(PIE_PREFIX.length).split(',').map(Number), 14);
  return images;
}
