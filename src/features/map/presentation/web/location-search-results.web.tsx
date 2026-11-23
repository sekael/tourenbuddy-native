import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import type { LocationResult } from '@/features/map/data/services/swisstopo-search-service';

import styles from './location-search-results.module.css';

const c = classes(styles);

/** The place search's results (or its error, or none found). */
export function LocationSearchResults({
  results,
  failed,
  onChoose,
  ref,
}: {
  results: LocationResult[];
  failed: boolean;
  onChoose: (result: LocationResult) => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation('web');
  return (
    <div
      ref={ref}
      className={c('search-results')}
      role="listbox"
      aria-label={t('tours.picker.search.label')}
    >
      {failed ? (
        <p className={c('search-message')}>
          <BaseIcon name="warning" size="sm" />
          {t('tours.picker.search.error')}
        </p>
      ) : results.length === 0 ? (
        <p className={c('search-message')}>
          <BaseIcon name="search_off" size="sm" />
          {t('tours.picker.search.noResults')}
        </p>
      ) : (
        results.map((result, i) => (
          <button
            key={`${result.origin}-${result.lng}-${result.lat}-${i}`}
            type="button"
            role="option"
            aria-selected="false"
            className={c('search-result')}
            onClick={() => onChoose(result)}
          >
            <span className={c('result-pin')}>
              <BaseIcon name="location_on" size="sm" />
            </span>
            <span className={c('result-text')}>
              <span className={c('result-name')}>{result.name}</span>
              <span className={c('result-meta')}>
                {[
                  result.kind ?? t(`tours.picker.search.origin.${result.origin}` as never),
                  result.region?.replace(/,(?=\S)/g, ', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
