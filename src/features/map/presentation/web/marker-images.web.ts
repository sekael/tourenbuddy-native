// Ported from the PWA's features/map/presentation/components/marker-images.ts (port-pwa-web): MapLibre GL JS on the web.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { TourType } from '@/features/tours/data/models/tour-type';
import { iconData } from '@/core/web/icon-data.web';
import { TOUR_TYPE_ICONS, TOUR_TYPE_VALUES } from '@/features/tours/data/models/tour-type';

/** Rasterisation factor: textures carry 4× detail while measuring their logical size. */
const SCALE = 4;

/**
 * Registers `svg` (a full `<svg>` document, `viewBox` in logical px) as image `id`, rasterised
 * at {@link SCALE}×. Resolves false when the browser can't decode it — the layer using it is
 * then simply not added.
 */
export async function loadSvgImage(
  map: MapLibreMap,
  id: string,
  svg: string,
  size: number,
  sdf = false,
): Promise<boolean> {
  if (map.hasImage(id)) return true;
  const px = size * SCALE;
  const sized = svg.replace(/<svg\b/, `<svg width="${px}" height="${px}"`);
  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
  return new Promise((resolve) => {
    const img = new Image(px, px);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        if (!map.hasImage(id)) map.addImage(id, img, { sdf, pixelRatio: SCALE });
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}

export const ACTIVITY_IMAGE_PREFIX = 'activity:';
/** Logical size of the white activity glyph inside a goal circle (28 px). */
export const ACTIVITY_GLYPH_SIZE = 18;

/** The activity's app icon as a white SVG document, rendered from the shared icon registry. */
export function activityGlyphSvg(type: TourType): string | null {
  const icon = iconData[TOUR_TYPE_ICONS[type]];
  if (!icon) return null;
  const svg = `<svg viewBox="${icon[0]}">${icon[1]}</svg>`;
  // Registry SVGs size themselves in `em` and paint `currentColor`; HTML serialisation drops the
  // namespace an image/svg+xml blob needs.
  const white = svg
    .replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(?:width|height)="[^"]*"/g, ''))
    .replaceAll('currentColor', '#ffffff');
  return white.includes('xmlns=')
    ? white
    : white.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Registers one glyph image per activity (`activity:<type>`). */
export async function loadActivityGlyphs(map: MapLibreMap): Promise<void> {
  await Promise.all(
    TOUR_TYPE_VALUES.map((type) => {
      const svg = activityGlyphSvg(type);
      return svg && loadSvgImage(map, `${ACTIVITY_IMAGE_PREFIX}${type}`, svg, ACTIVITY_GLYPH_SIZE);
    }),
  );
}

/** Transparent stand-in for an untyped tour's glyph: it still claims the marker's footprint. */
export const BLANK_IMAGE_ID = 'activity-blank';
export function loadBlankImage(map: MapLibreMap): Promise<boolean> {
  return loadSvgImage(
    map,
    BLANK_IMAGE_ID,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>',
    ACTIVITY_GLYPH_SIZE,
  );
}

/** Logical diameter of a corner badge (completion, friend, link). */
export const BADGE_SIZE = 17;

/** A badge disc with a white ring around `inner` (drawn in a 0..24 box, centred at 10.8 units). */
function badgeSvg(fill: string, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BADGE_SIZE} ${BADGE_SIZE}">
    <circle cx="8.5" cy="8.5" r="7.6" fill="${fill}" stroke="#ffffff" stroke-width="1.6" />
    <g transform="translate(3.1 3.1) scale(0.45)">${inner}</g>
  </svg>`;
}

export const COMPLETED_BADGE_ID = 'tour-badge-completed';
export const FRIEND_BADGE_ID = 'tour-badge-friend';
export const LINK_BADGE_ID = 'tour-badge-link';

const CHECK_GLYPH =
  '<polyline points="4.5,12.5 9.5,17.5 19.5,7" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />';
// Two-person and chain glyphs, as the marker used to draw them full size (24-unit box).
const FRIEND_GLYPH = `<g fill="#1F2937" transform="scale(0.857)">
  <circle cx="10" cy="9" r="3.5" /><path d="M4 21c0-3.3 2.7-6 6-6s6 2.7 6 6z" />
  <circle cx="19" cy="10" r="3" /><path d="M19 14c2.8 0 5 2.2 5 5h-6.2c.2-.6.2-1.2.2-1.8 0-1.2-.3-2.3-.8-3.2z" />
</g>`;
const LINK_GLYPH = `<g fill="none" stroke="#1F2937" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" transform="scale(0.857)">
  <path d="M11.5 16.5l-3 3a3.5 3.5 0 1 1-4.95-4.95l3-3a3.5 3.5 0 0 1 4.95 0" />
  <path d="M16.5 11.5l3-3a3.5 3.5 0 1 1 4.95 4.95l-3 3a3.5 3.5 0 0 1-4.95 0" />
  <path d="M10.5 17.5l7-7" />
</g>`;

/** Completion (green ✓), friend and link badges; resolves which ones loaded. */
export async function loadBadges(map: MapLibreMap) {
  const [completed, friend, link] = await Promise.all([
    loadSvgImage(map, COMPLETED_BADGE_ID, badgeSvg('#15803D', CHECK_GLYPH), BADGE_SIZE),
    loadSvgImage(map, FRIEND_BADGE_ID, badgeSvg('#ffffff', FRIEND_GLYPH), BADGE_SIZE),
    loadSvgImage(map, LINK_BADGE_ID, badgeSvg('#ffffff', LINK_GLYPH), BADGE_SIZE),
  ]);
  return { completed, friend, link };
}

/** A white glyph (24-unit box) for the start/end detail markers. */
export function whiteGlyphSvg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff">${inner}</svg>`;
}
