import { icons, type IconName } from '@/core/adaptive/icons';

import {
  BADGE,
  BADGE_HEIGHT,
  BADGE_RING,
  BADGE_SHADOW,
  BUCKET_COLORS,
  CLUSTER_RADIUS,
  CLUSTER_SIZE,
  GLYPH,
  MARKER_RADIUS,
  markerDrawings,
  mix,
  PIE_STEPS,
  SKIER_PATH,
  type MarkerDrawing,
} from './marker-ids';

export * from './marker-ids';

/**
 * The map's images on the web: the same set as the native Skia drawer, drawn on a 2D canvas (GL JS
 * takes pixels, and Skia would need CanvasKit's WebAssembly). Glyphs are SVG, so they load first.
 */
export type WebMarkerImage = { image: ImageData; pixelRatio: number };

const RATIO = Math.max(2, Math.ceil(globalThis.devicePixelRatio ?? 1));
const TAU = Math.PI * 2;
const rad = (deg: number) => (deg * Math.PI) / 180;

function render(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): WebMarkerImage {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * RATIO);
  canvas.height = Math.ceil(height * RATIO);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RATIO, RATIO);
  draw(ctx);
  return { image: ctx.getImageData(0, 0, canvas.width, canvas.height), pixelRatio: RATIO };
}

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string | CanvasGradient,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function slice(
  ctx: CanvasRenderingContext2D,
  c: number,
  r: number,
  from: number,
  sweep: number,
  fill: string,
) {
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.arc(c, c, r, rad(from), rad(from + sweep));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
}

type Glyphs = Map<string, HTMLImageElement>;
const glyphKey = (name: IconName, color: string) => `${name}|${color}`;

function glyphSvg(name: IconName, color: string): string {
  const icon = icons[name];
  const svg =
    'svg' in icon
      ? icon.svg
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${icon.md}"/></svg>`;
  return svg.replace(/currentColor/g, color);
}

/** Every glyph a drawing needs, as loaded images. */
async function loadGlyphs(drawings: MarkerDrawing[]): Promise<Glyphs> {
  const wanted = new Map<string, [IconName, string]>();
  for (const d of drawings) {
    if (d.kind === 'badge') wanted.set(glyphKey(d.glyph, d.glyphColor), [d.glyph, d.glyphColor]);
    if (d.kind === 'point' || d.kind === 'activity')
      wanted.set(glyphKey(d.glyph, '#ffffff'), [d.glyph, '#ffffff']);
  }
  const glyphs: Glyphs = new Map();
  await Promise.all(
    [...wanted].map(async ([key, [name, color]]) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyphSvg(name, color))}`;
      await img.decode();
      glyphs.set(key, img);
    }),
  );
  return glyphs;
}

function draw(d: MarkerDrawing, glyphs: Glyphs): WebMarkerImage {
  const glyph = (
    ctx: CanvasRenderingContext2D,
    name: IconName,
    color: string,
    at: number,
    size: number,
  ) => {
    const img = glyphs.get(glyphKey(name, color));
    if (img) ctx.drawImage(img, at, at, size, size);
  };
  switch (d.kind) {
    case 'blank':
      return render(1, 1, () => {});
    case 'clusterShadow':
      return render(CLUSTER_SIZE, CLUSTER_SIZE, (ctx) => {
        // A soft edge instead of a blur filter, which Safari's canvas lacks.
        const c = CLUSTER_SIZE / 2;
        const shade = ctx.createRadialGradient(
          c,
          c + 1,
          CLUSTER_RADIUS - 1.5,
          c,
          c + 1,
          CLUSTER_RADIUS + 1.5,
        );
        shade.addColorStop(0, 'rgba(0,0,0,0.35)');
        shade.addColorStop(1, 'rgba(0,0,0,0)');
        circle(ctx, c, c + 1, CLUSTER_RADIUS + 1.5, shade);
      });
    case 'clusterFace':
      return render(CLUSTER_SIZE, CLUSTER_SIZE, (ctx) => {
        const c = CLUSTER_SIZE / 2;
        ctx.beginPath();
        ctx.arc(c, c, CLUSTER_RADIUS - 1, 0, TAU);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        circle(ctx, c, c, 9, 'rgba(255,255,255,0.95)');
      });
    case 'badge': {
      const size = BADGE + 2;
      return render(size, size, (ctx) => {
        circle(ctx, size / 2, size / 2, size / 2, '#ffffff');
        circle(ctx, size / 2, size / 2, size / 2 - 1.2, d.fill);
        glyph(ctx, d.glyph, d.glyphColor, 2.5, size - 5);
      });
    }
    case 'point':
      return render(24, 24, (ctx) => {
        circle(ctx, 12, 12, 12, '#ffffff');
        circle(ctx, 12, 12, 10, '#334155');
        glyph(ctx, d.glyph, '#ffffff', 5, 14);
      });
    case 'activity':
      return render(GLYPH, GLYPH, (ctx) => glyph(ctx, d.glyph, '#ffffff', 0, GLYPH));
    case 'wedge':
      return render(CLUSTER_SIZE, CLUSTER_SIZE, (ctx) =>
        // 1° under the next wedge hides the anti-aliased seam between the two.
        slice(
          ctx,
          CLUSTER_SIZE / 2,
          CLUSTER_RADIUS,
          -90,
          Math.min(360, (d.steps * 360) / PIE_STEPS + 1),
          BUCKET_COLORS[d.bucket]!,
        ),
      );
    case 'pie': {
      const r = MARKER_RADIUS;
      const total = d.weights.reduce((a, b) => a + b, 0) || 1;
      return render(r * 2 + 4, r * 2 + 4, (ctx) => {
        let angle = -90;
        d.weights.forEach((w, i) => {
          if (!w) return;
          const sweep = (w / total) * 360;
          slice(ctx, r + 2, r, angle, sweep, BUCKET_COLORS[i]!);
          angle += sweep;
        });
        ctx.beginPath();
        ctx.arc(r + 2, r + 2, r, 0, TAU);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
    case 'skiBadge': {
      const font = '600 12px Inter, system-ui, sans-serif';
      const measure = document.createElement('canvas').getContext('2d')!;
      measure.font = font;
      const label = d.label;
      const width = label
        ? 6 + 14 + 4 + Math.ceil(measure.measureText(label).width) + 9
        : BADGE_HEIGHT;
      return render(width + 2 * BADGE_SHADOW, BADGE_HEIGHT + 2 * BADGE_SHADOW, (ctx) => {
        const x = BADGE_SHADOW;
        const y = BADGE_SHADOW - 1;
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
        ctx.shadowBlur = BADGE_SHADOW * RATIO;
        ctx.shadowOffsetY = RATIO;
        pill(ctx, x, y, width, BADGE_HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
        const gradient = ctx.createLinearGradient(0, y, 0, y + BADGE_HEIGHT);
        gradient.addColorStop(0, mix(d.color, '#ffffff', 0.18));
        gradient.addColorStop(1, d.color);
        pill(
          ctx,
          x + BADGE_RING,
          y + BADGE_RING,
          width - 2 * BADGE_RING,
          BADGE_HEIGHT - 2 * BADGE_RING,
        );
        ctx.fillStyle = gradient;
        ctx.fill();
        const size = 14;
        ctx.save();
        ctx.translate(label ? x + 6 : x + (width - size) / 2, y + (BADGE_HEIGHT - size) / 2);
        ctx.scale(size / 24, size / 24);
        ctx.fillStyle = '#ffffff';
        ctx.fill(new Path2D(SKIER_PATH));
        ctx.restore();
        if (label) {
          ctx.font = font;
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + 6 + size + 4, y + BADGE_HEIGHT / 2 + 0.5);
        }
      });
    }
  }
}

let drawn: Promise<Record<string, WebMarkerImage>> | null = null;

/** Every image, drawn once for the page's life. */
export function loadMarkerImages(): Promise<Record<string, WebMarkerImage>> {
  drawn ??= (async () => {
    const drawings = markerDrawings();
    const glyphs = await loadGlyphs(drawings.map(([, d]) => d));
    return Object.fromEntries(drawings.map(([id, d]) => [id, draw(d, glyphs)]));
  })();
  return drawn;
}
