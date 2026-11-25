// Ported from the PWA's features/map/presentation/components/ski-badge.ts (port-pwa-web): MapLibre GL JS on the web.
import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { skiDifficultyGrade } from '@/features/map/domain/ski-difficulty';

// Difficulty ramp, one stop per SAC grade (Tailwind -500/-600/-800/-950) so the
// common WS/ZS/S routes differ at a glance: sky (L) → purple (SS) → deep purple (EX).
const GRADE_COLORS = ['#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#9333ea', '#6b21a8', '#3b0764'];
// The stone grey tour markers use for a missing activity type.
const NO_DIFFICULTY_COLOR = '#78716c';

// Material Symbols `downhill-skiing` (24×24), the icon the app uses for ski touring.
const SKIER_PATH =
  'M18.5 23q-.65 0-1.263-.1t-1.187-.3L2 17.475l.5-1.425l6.9 2.525l1.725-4.45L7.55 10.4q-.675-.7-.537-1.662T8 7.275l3.475-2q.425-.25.863-.288t.862.138q.425.15.738.475t.462.775l.325 1.075q.325 1.075 1.063 1.9t1.762 1.25l.525-1.6l1.425.45l-1.125 3.45q-1.85-.3-3.275-1.45T13 8.6l-2.525 1.45L13.5 13.5l-2.225 5.75l3.1 1.125l2.1-6.425q.35.125.7.225t.725.175l-2.125 6.55l.775.275q.45.15.938.237t1.012.088q.65 0 1.238-.125T20.875 21L22 22.125q-.8.425-1.675.65T18.5 23M15.088 5.913Q14.5 5.325 14.5 4.5t.588-1.412T16.5 2.5t1.413.588T18.5 4.5t-.587 1.413T16.5 6.5t-1.412-.587';

const PREFIX = 'ski-badge|';
const HEIGHT = 24;
const RING = 2;
const SHADOW = 4;

function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Badge color for a `skiDifficultyGrade` (null = no difficulty); +/- sit between stops. */
export function gradeColor(grade: number | null): string {
  if (grade === null) return NO_DIFFICULTY_COLOR;
  const pos = Math.min(Math.max((grade - 1) / 3, 0), GRADE_COLORS.length - 1);
  const i = Math.floor(pos);
  return i === GRADE_COLORS.length - 1
    ? GRADE_COLORS[i]!
    : mix(GRADE_COLORS[i]!, GRADE_COLORS[i + 1]!, pos - i);
}

/**
 * `gradeColor` as a MapLibre expression over a feature's numeric `grade` property:
 * the same stops, mixed linearly in RGB like `mix`. Missing grade → grey.
 */
export function gradeColorExpression(): ExpressionSpecification {
  const stops = GRADE_COLORS.flatMap((color, i) => [1 + i * 3, color]);
  return [
    'case',
    ['==', ['typeof', ['get', 'grade']], 'number'],
    ['interpolate', ['linear'], ['get', 'grade'], ...stops],
    NO_DIFFICULTY_COLOR,
  ];
}

/**
 * MapLibre image id of a feature's badge, from its difficulty label in the UI
 * language (`lang`: de/fr/it/en), falling back to German like `mapSkiRoute`.
 * Drawn on first use by `registerSkiBadges`.
 */
export function skiBadgeImage(lang: string): ExpressionSpecification {
  return [
    'concat',
    PREFIX,
    ['coalesce', ['get', `difficulty_${lang}`], ['get', 'difficulty_de'], ''],
  ];
}

/**
 * A pill in the difficulty color: skier glyph + difficulty, white ring, soft shadow.
 * No label = a round badge with just the skier. Drawn at device resolution.
 */
function drawBadge(label: string, color: string, ratio: number): ImageData {
  const font = `600 12px Inter, system-ui, sans-serif`;
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = font;
  const textWidth = label ? Math.ceil(ctx.measureText(label).width) : 0;
  const pill = label ? 6 + 14 + 4 + textWidth + 9 : HEIGHT;
  const width = pill + 2 * SHADOW;
  const height = HEIGHT + 2 * SHADOW;

  const canvas = ctx.canvas;
  canvas.width = Math.ceil(width * ratio);
  canvas.height = Math.ceil(height * ratio);
  ctx.scale(ratio, ratio);

  const x = SHADOW;
  const y = SHADOW - 1;
  ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
  ctx.shadowBlur = SHADOW;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(x, y, pill, HEIGHT, HEIGHT / 2);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  const gradient = ctx.createLinearGradient(0, y, 0, y + HEIGHT);
  gradient.addColorStop(0, mix(color, '#ffffff', 0.18));
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(x + RING, y + RING, pill - 2 * RING, HEIGHT - 2 * RING, HEIGHT / 2 - RING);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.save();
  const glyph = 14;
  ctx.translate(label ? x + 6 : x + (pill - glyph) / 2, y + (HEIGHT - glyph) / 2);
  ctx.scale(glyph / 24, glyph / 24);
  ctx.fill(new Path2D(SKIER_PATH));
  ctx.restore();

  if (label) {
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 6 + glyph + 4, y + HEIGHT / 2 + 0.5);
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Draws badges on demand: MapLibre asks for each id once per style load. */
export function registerSkiBadges(map: MapLibreMap) {
  map.on('styleimagemissing', ({ id }: { id: string }) => {
    if (!id.startsWith(PREFIX) || map.hasImage(id)) return;
    const raw = id.slice(PREFIX.length);
    const grade = skiDifficultyGrade(raw || null);
    // Unknown difficulty text → a plain grey badge, as without a difficulty.
    const label = grade === null ? '' : raw;
    const color = gradeColor(grade);
    const ratio = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    map.addImage(id, drawBadge(label, color, ratio), { pixelRatio: ratio });
  });
}
