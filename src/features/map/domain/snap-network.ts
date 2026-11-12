import type { TrailOverlayId } from '@/features/map/data/trail-overlays';
import { onSkis } from '@/features/tours/domain/route-metrics';

/** What a drawn line follows first, before the base map's roads and paths; null = those ways alone. */
export type SnapNetwork = TrailOverlayId;

/**
 * A drawing follows what the map shows first: the hiking trails, the ski routes, or — both shown —
 * the ones the tour's activity goes on. Ski touring picks the ski routes; hiking wins when both are
 * picked, and when the activity says neither. Every way of the base map comes after them.
 */
export function snapNetworkFor(
  overlays: readonly TrailOverlayId[],
  tourTypes: readonly string[],
): SnapNetwork | null {
  const hiking = overlays.includes('hiking');
  const ski = overlays.includes('ski');
  if (hiking && ski) return onSkis(tourTypes) ? 'ski' : 'hiking';
  return hiking ? 'hiking' : ski ? 'ski' : null;
}
