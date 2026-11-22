import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Dates, numbers and the route's units in the app's language (ported from the PWA's
 * `use-formatter`). Hermes may lack `formatRange`: a range then reads "start – end".
 */
export function useFormatter() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  return useMemo(() => {
    const formatDate = (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(date));
    return {
      formatDate,
      /** `start`–`end` with shared parts collapsed where the engine can; one day when equal. */
      formatDateRange: (start: Date, end: Date, options?: Intl.DateTimeFormatOptions) => {
        const fmt = new Intl.DateTimeFormat(locale, options);
        if (start.getTime() === end.getTime()) return fmt.format(start);
        const range = (fmt as { formatRange?: (a: Date, b: Date) => string }).formatRange;
        return range ? range.call(fmt, start, end) : `${fmt.format(start)} – ${fmt.format(end)}`;
      },
      formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
        new Intl.NumberFormat(locale, options).format(value),
      /** A height as swisstopo and SAC write it: whole metres, no separator — "3079 m". */
      formatElevation: (metres: number) =>
        `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: false }).format(metres)} m`,
      /** Horizontal distance in kilometres to one decimal — "8.4 km". */
      formatDistance: (metres: number) =>
        `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(metres / 1000)} km`,
      /** A time on the way, to the minute, as SAC writes it — "45 min", "2:05 h". */
      formatDuration: (minutes: number) =>
        minutes < 60
          ? t('tours.route.minutes', { m: minutes })
          : t('tours.route.hours', {
              h: Math.floor(minutes / 60),
              m: String(minutes % 60).padStart(2, '0'),
            }),
    };
  }, [locale, t]);
}

export type Formatter = ReturnType<typeof useFormatter>;
