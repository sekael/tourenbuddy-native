import { useTranslation } from 'react-i18next';

import { useFormatter } from '@/core/i18n/format';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { flight, type FlownWay } from '@/features/tours/domain/legs';
import type { RouteMetrics } from '@/features/tours/domain/route-metrics';

import { useRouteMetrics } from './use-route-metrics';

const LABELS = {
  ascent: ['tours.route.ascent', 'tours.route.flightUp', 'tours.route.ascentPartFlown'],
  descent: ['tours.route.descent', 'tours.route.flight', 'tours.route.descentPartFlown'],
} as const;

/**
 * Climb · descent · distance · time as a guide reads them — "↑ 447 m  ↓ 1257 m  8.4 km  3:20 h" —
 * each only when known and not zero; `label` spells the arrows out for VoiceOver.
 */
export function useRouteNumbers(
  tour: Tour | null,
  minutesFor: (metrics: RouteMetrics) => number | null,
): { metrics: RouteMetrics; numbers: { text: string; label: string } | null } {
  const { t } = useTranslation();
  const { formatElevation, formatDistance, formatDuration } = useFormatter();
  const { metrics } = useRouteMetrics(tour);
  const minutes = minutesFor(metrics);
  const flown = tour ? flight(tour) : { up: null, down: null };
  const way = (key: keyof typeof LABELS, ways: FlownWay) =>
    t(LABELS[key][Math.min(ways?.length ?? 0, 2)]);

  const parts: { text: string; label: string }[] = [];
  if (metrics.ascent) {
    const value = formatElevation(metrics.ascent);
    parts.push({ text: `↑ ${value}`, label: `${way('ascent', flown.up)} ${value}` });
  }
  if (metrics.descent) {
    const value = formatElevation(metrics.descent);
    parts.push({ text: `↓ ${value}`, label: `${way('descent', flown.down)} ${value}` });
  }
  if (metrics.distance) {
    const value = formatDistance(metrics.distance);
    parts.push({ text: value, label: `${t('tours.route.distance')} ${value}` });
  }
  if (minutes) {
    const value = formatDuration(minutes);
    parts.push({ text: value, label: `${t('tours.route.time')} ${value}` });
  }
  return {
    metrics,
    numbers: parts.length
      ? {
          // A number keeps its unit and arrow on its line ("10:31 h"); lines break between numbers.
          text: parts.map((p) => p.text.replace(/ /g, '\u00a0')).join('  '),
          label: parts.map((p) => p.label).join(', '),
        }
      : null,
  };
}
