import { TOUR_TYPE_COLORS } from '@/features/tours/data/models/tour-type';

/** The marker colours, one per activity group, then the no-activity grey (map-integration). */
export const BUCKET_COLORS = [...new Set(Object.values(TOUR_TYPE_COLORS)), '#78716C'];
export const FALLBACK_COLOR = BUCKET_COLORS[BUCKET_COLORS.length - 1]!;
