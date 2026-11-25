import { useTranslation } from 'react-i18next';

/** The PWA's formatters, in the app language (`useFormatter` there; plain functions, no `.value`). */
export function useFormatter() {
  const { t, i18n } = useTranslation('web');
  const locale = i18n.language;
  return {
    formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(date)),
    /** `start`–`end` with the shared parts collapsed per locale; a single day when they match. */
    formatDateRange: (start: Date, end: Date, options?: Intl.DateTimeFormatOptions) => {
      const fmt = new Intl.DateTimeFormat(locale, options);
      return start.getTime() === end.getTime() ? fmt.format(start) : fmt.formatRange(start, end);
    },
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    /** A height as swisstopo and SAC write it: whole metres, no separator, no-break space. */
    formatElevation: (metres: number) =>
      `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: false }).format(metres)} m`,
    /** Horizontal distance in kilometres to one decimal: "8.4 km". */
    formatDistance: (metres: number) =>
      `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(metres / 1000)} km`,
    /** A time on the way, to the minute, as SAC writes it: "45 min", "2:05 h". */
    formatDuration: (minutes: number) =>
      minutes < 60
        ? t('tours.route.minutes', { m: minutes })
        : t('tours.route.hours', {
            h: Math.floor(minutes / 60),
            m: String(minutes % 60).padStart(2, '0'),
          }),
  };
}
