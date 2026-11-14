import { z } from 'zod';

export const TOUR_TYPE_VALUES = [
  'skiing',
  'snowboarding',
  'skitour',
  'splitboarding',
  'ski-mountaineering',
  'paragliding',
  'hiking',
  'mountaineering',
  'climbing',
  'mountain-biking',
  'trailrunning',
] as const;

export const tourTypeSchema = z.enum(TOUR_TYPE_VALUES);

export type TourType = z.infer<typeof tourTypeSchema>;

export const TOUR_TYPE_I18N_KEYS: Record<TourType, string> = {
  skiing: 'skiing',
  snowboarding: 'snowboarding',
  skitour: 'skitour',
  splitboarding: 'splitboarding',
  'ski-mountaineering': 'skiMountaineering',
  paragliding: 'paragliding',
  hiking: 'hiking',
  mountaineering: 'mountaineering',
  climbing: 'climbing',
  'mountain-biking': 'mountainBiking',
  trailrunning: 'trailrunning',
};

export const TOUR_TYPE_LABELS: Record<TourType, string> = {
  skiing: 'Skiing',
  snowboarding: 'Snowboarding',
  skitour: 'Ski Tour',
  splitboarding: 'Splitboarding',
  'ski-mountaineering': 'Ski Mountaineering',
  paragliding: 'Paragliding',
  hiking: 'Hiking',
  mountaineering: 'Mountaineering',
  climbing: 'Climbing',
  'mountain-biking': 'Mountain Biking',
  trailrunning: 'Trail Running',
};

export const TOUR_TYPE_ICONS: Record<TourType, string> = {
  skiing: 'downhill_skiing',
  snowboarding: 'snowboarding',
  skitour: 'ski_touring',
  splitboarding: 'splitboarding',
  'ski-mountaineering': 'ski_mountaineering',
  paragliding: 'paragliding',
  hiking: 'hiking',
  mountaineering: 'mountaineering',
  climbing: 'climbing',
  'mountain-biking': 'directions_bike',
  trailrunning: 'sprint',
};

/**
 * Marker colour per activity group — six, the most a map can keep apart (any two markers can sit
 * side by side; validated for colour-blind and full-colour vision against each other, the done
 * green and the no-activity grey). Winter is blue (piste sky, touring indigo), on foot red (hike
 * rose, alpine rock brown), bike plum, flying amber. The glyph inside names the exact activity.
 */
export const TOUR_TYPE_COLORS: Record<TourType, string> = {
  skiing: '#0284C7',
  snowboarding: '#0284C7',
  skitour: '#4338CA',
  splitboarding: '#4338CA',
  'ski-mountaineering': '#4338CA',
  paragliding: '#D97706',
  hiking: '#E11D48',
  mountaineering: '#9A3412',
  climbing: '#9A3412',
  'mountain-biking': '#86198F',
  trailrunning: '#E11D48',
};

/** Each group's darker shade for tracks — at most ~18 points darker, never so dark its hue is lost. */
export const TOUR_TYPE_TRACK_COLORS: Record<TourType, string> = {
  skiing: '#0C4A6E',
  snowboarding: '#0C4A6E',
  skitour: '#312E81',
  splitboarding: '#312E81',
  'ski-mountaineering': '#312E81',
  paragliding: '#804604',
  hiking: '#90132E',
  mountaineering: '#7C2D12',
  climbing: '#7C2D12',
  'mountain-biking': '#701A75',
  trailrunning: '#90132E',
};

/** Each group's light shade, for a goal still being placed. */
export const TOUR_TYPE_PREVIEW_COLORS: Record<TourType, string> = {
  skiing: '#7DD3FC',
  snowboarding: '#7DD3FC',
  skitour: '#A5B4FC',
  splitboarding: '#A5B4FC',
  'ski-mountaineering': '#A5B4FC',
  paragliding: '#FCD34D',
  hiking: '#FDA4AF',
  mountaineering: '#FDBA74',
  climbing: '#FDBA74',
  'mountain-biking': '#F0ABFC',
  trailrunning: '#FDA4AF',
};

/**
 * The distinct palette colours of a tour's types, in type order — e.g. skitour + splitboarding
 * is one indigo, skitour + hiking is indigo then rose. Empty for an untyped tour.
 */
export function distinctTypeColors(
  types: readonly TourType[],
  palette: Record<TourType, string>,
): string[] {
  return [...new Set(types.map((t) => palette[t]))];
}

/** CSS background split like a marker: solid, or equal conic slices from 12 o'clock (map dots, outing badges). */
export function cssFill(colors: readonly string[]): string {
  if (colors.length === 1) return colors[0]!;
  const step = 100 / colors.length;
  return `conic-gradient(${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`;
}
