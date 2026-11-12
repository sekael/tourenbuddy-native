import type { ImageEntry } from '@maplibre/maplibre-react-native';
import {
  BlurStyle,
  matchFont,
  PaintStyle,
  Skia,
  TileMode,
  type SkCanvas,
} from '@shopify/react-native-skia';
import { PixelRatio, Platform } from 'react-native';

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
 * Every image the map's layers can ask for, drawn with Skia once at start (S3, #367): a native map
 * asks for a missing image once and never again, so the PWA's draw-on-demand does not port.
 */

const RATIO = Math.max(2, Math.ceil(PixelRatio.get()));

function render(width: number, height: number, draw: (canvas: SkCanvas) => void): ImageEntry {
  const surface = Skia.Surface.Make(Math.ceil(width * RATIO), Math.ceil(height * RATIO))!;
  const canvas = surface.getCanvas();
  canvas.scale(RATIO, RATIO);
  draw(canvas);
  surface.flush();
  const uri = `data:image/png;base64,${surface.makeImageSnapshot().encodeToBase64()}`;
  return { source: { uri, scale: RATIO } };
}

const paint = (color: string) => {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  return p;
};

function drawPie(weights: number[]): ImageEntry {
  const r = MARKER_RADIUS;
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return render(r * 2 + 4, r * 2 + 4, (canvas) => {
    const oval = Skia.XYWHRect(2, 2, r * 2, r * 2);
    let angle = -90;
    weights.forEach((w, i) => {
      if (!w) return;
      const sweep = (w / total) * 360;
      canvas.drawArc(oval, angle, sweep, true, paint(BUCKET_COLORS[i]!));
      angle += sweep;
    });
    const ring = paint('#ffffff');
    ring.setStyle(PaintStyle.Stroke);
    ring.setStrokeWidth(1.5);
    canvas.drawCircle(r + 2, r + 2, r, ring);
  });
}

function drawWedge(bucket: number, steps: number): ImageEntry {
  return render(CLUSTER_SIZE, CLUSTER_SIZE, (canvas) => {
    const c = CLUSTER_SIZE / 2;
    const oval = Skia.XYWHRect(
      c - CLUSTER_RADIUS,
      c - CLUSTER_RADIUS,
      CLUSTER_RADIUS * 2,
      CLUSTER_RADIUS * 2,
    );
    // 1° under the next wedge hides the anti-aliased seam between the two.
    canvas.drawArc(
      oval,
      -90,
      Math.min(360, (steps * 360) / PIE_STEPS + 1),
      true,
      paint(BUCKET_COLORS[bucket]!),
    );
  });
}

function drawClusterFrame(face: boolean): ImageEntry {
  return render(CLUSTER_SIZE, CLUSTER_SIZE, (canvas) => {
    const c = CLUSTER_SIZE / 2;
    if (!face) {
      const shadow = paint('#000000');
      shadow.setAlphaf(0.35);
      shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 1.5, true));
      canvas.drawCircle(c, c + 1, CLUSTER_RADIUS, shadow);
      return;
    }
    const ring = paint('#ffffff');
    ring.setStyle(PaintStyle.Stroke);
    ring.setStrokeWidth(2);
    canvas.drawCircle(c, c, CLUSTER_RADIUS - 1, ring);
    const backdrop = paint('#ffffff');
    backdrop.setAlphaf(0.95);
    canvas.drawCircle(c, c, 9, backdrop);
  });
}

/** A registry icon in white at `size`: its Material path, or the app's own SVG glyph. */
function drawGlyph(
  canvas: SkCanvas,
  name: IconName,
  x: number,
  y: number,
  size: number,
  color = '#ffffff',
) {
  const icon = icons[name];
  canvas.save();
  canvas.translate(x, y);
  if ('svg' in icon) {
    const svg = Skia.SVG.MakeFromString(icon.svg.replace(/currentColor/g, color));
    if (svg) {
      canvas.scale(size / 24, size / 24);
      canvas.drawSvg(svg, 24, 24);
    }
  } else {
    const path = Skia.Path.MakeFromSVGString(icon.md);
    canvas.scale(size / 24, size / 24);
    if (path) canvas.drawPath(path, paint(color));
  }
  canvas.restore();
}

function drawBadge(fill: string, glyph: IconName, glyphColor: string): ImageEntry {
  const size = BADGE + 2;
  return render(size, size, (canvas) => {
    canvas.drawCircle(size / 2, size / 2, size / 2, paint('#ffffff'));
    canvas.drawCircle(size / 2, size / 2, size / 2 - 1.2, paint(fill));
    drawGlyph(canvas, glyph, 2.5, 2.5, size - 5, glyphColor);
  });
}

function drawPoint(glyph: IconName): ImageEntry {
  const size = 24;
  return render(size, size, (canvas) => {
    canvas.drawCircle(size / 2, size / 2, size / 2, paint('#ffffff'));
    canvas.drawCircle(size / 2, size / 2, size / 2 - 2, paint('#334155'));
    drawGlyph(canvas, glyph, 5, 5, size - 10);
  });
}

let badgeFont: ReturnType<typeof matchFont> | null = null;

function drawSkiBadge(label: string, color: string): ImageEntry {
  badgeFont ??= matchFont({
    fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
    fontSize: 12,
    fontWeight: '600',
  });
  const font = badgeFont;
  const textWidth = label ? Math.ceil(font.measureText(label).width) : 0;
  const pill = label ? 6 + 14 + 4 + textWidth + 9 : BADGE_HEIGHT;
  return render(pill + 2 * BADGE_SHADOW, BADGE_HEIGHT + 2 * BADGE_SHADOW, (canvas) => {
    const x = BADGE_SHADOW;
    const y = BADGE_SHADOW - 1;
    const white = paint('#ffffff');
    const shadowed = paint('#ffffff');
    shadowed.setImageFilter(
      Skia.ImageFilter.MakeDropShadow(
        0,
        1,
        BADGE_SHADOW / 2,
        BADGE_SHADOW / 2,
        Skia.Color('rgba(15, 23, 42, 0.35)'),
      ),
    );
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(x, y, pill, BADGE_HEIGHT), BADGE_HEIGHT / 2, BADGE_HEIGHT / 2),
      shadowed,
    );
    const gradient = paint(color);
    gradient.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: 0, y },
        { x: 0, y: y + BADGE_HEIGHT },
        [Skia.Color(mix(color, '#ffffff', 0.18)), Skia.Color(color)],
        null,
        TileMode.Clamp,
      ),
    );
    const inner = Skia.XYWHRect(
      x + BADGE_RING,
      y + BADGE_RING,
      pill - 2 * BADGE_RING,
      BADGE_HEIGHT - 2 * BADGE_RING,
    );
    canvas.drawRRect(
      Skia.RRectXY(inner, BADGE_HEIGHT / 2 - BADGE_RING, BADGE_HEIGHT / 2 - BADGE_RING),
      gradient,
    );
    const glyph = 14;
    const skier = Skia.Path.MakeFromSVGString(SKIER_PATH)!;
    canvas.save();
    canvas.translate(label ? x + 6 : x + (pill - glyph) / 2, y + (BADGE_HEIGHT - glyph) / 2);
    canvas.scale(glyph / 24, glyph / 24);
    canvas.drawPath(skier, white);
    canvas.restore();
    if (label) {
      const { ascent, descent } = font.getMetrics();
      canvas.drawText(
        label,
        x + 6 + glyph + 4,
        y + BADGE_HEIGHT / 2 + 0.5 - (ascent + descent) / 2,
        white,
        font,
      );
    }
  });
}

function draw(d: MarkerDrawing): ImageEntry {
  switch (d.kind) {
    case 'blank':
      return render(1, 1, () => {});
    case 'clusterShadow':
      return drawClusterFrame(false);
    case 'clusterFace':
      return drawClusterFrame(true);
    case 'badge':
      return drawBadge(d.fill, d.glyph, d.glyphColor);
    case 'point':
      return drawPoint(d.glyph);
    case 'activity':
      return render(GLYPH, GLYPH, (canvas) => drawGlyph(canvas, d.glyph, 0, 0, GLYPH));
    case 'wedge':
      return drawWedge(d.bucket, d.steps);
    case 'skiBadge':
      return drawSkiBadge(d.label, d.color);
    case 'pie':
      return drawPie(d.weights);
  }
}

let drawn: Record<string, ImageEntry> | null = null;

/** Every image, drawn on first use and kept for the app's life (a few hundred small PNGs). */
export function markerImages(): Record<string, ImageEntry> {
  drawn ??= Object.fromEntries(markerDrawings().map(([id, d]) => [id, draw(d)]));
  return drawn;
}
