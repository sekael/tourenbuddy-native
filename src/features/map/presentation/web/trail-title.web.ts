// Ported from the PWA's features/map/presentation/composables/trail-title.ts (port-pwa-web): MapLibre GL JS on the web.
import type { Trail } from '@/features/map/domain/entities/trail';

/** "Target · 2024m", or the generic label for a route without info. */
export function trailTitle(
  { route }: Trail,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (!route) return t('map.trail.skiRoute');
  return route.targetAltitude != null
    ? t('map.trail.target', { name: route.targetName, altitude: route.targetAltitude })
    : route.targetName;
}
