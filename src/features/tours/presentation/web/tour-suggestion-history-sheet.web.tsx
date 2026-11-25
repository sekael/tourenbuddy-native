import { useTranslation } from 'react-i18next';

import { classes } from '@/core/web/classes';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';

import styles from './tour-suggestion-history-sheet.module.css';
import { TourSuggestionRow } from './tour-suggestion-row.web';

const c = classes(styles);

/** Resolved suggestions on a tour: the retained record of what was proposed and how it was decided. */
export function TourSuggestionHistorySheet({
  tour,
  mode,
}: {
  tour: Tour;
  mode: 'owner' | 'author';
}) {
  const { t, i18n } = useTranslation('web');
  const me = useAuthStore((s) => s.user?.id ?? null);
  useTourSuggestionsStore((s) => s.suggestions);
  const batches = useTourSuggestionsStore.getState().resolvedBatchesFor(tour.id);

  /** The author named from the reader's side ("you"), not the owner-resolved name. */
  const authorLabel = (suggesterId: string, suggesterName: string | null) =>
    suggesterId === me
      ? t('tours.suggestions.byYou')
      : t('tours.suggestions.byAuthor', { name: suggesterName ?? t('tours.suggestions.aPartner') });

  const formatResolvedAt = (date: Date | null) =>
    date
      ? date.toLocaleDateString(i18n.language, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

  return (
    <section className={c('history')}>
      {batches.length === 0 && (
        <p className={c('empty')} data-testid="history-empty">
          {t('tours.suggestions.historyEmpty')}
        </p>
      )}
      {batches.map((batch) => (
        <article key={batch.batchId} className={c('batch')}>
          <header className={c('batch-head')}>
            <span className={c('batch-author')}>
              {authorLabel(batch.suggesterId, batch.suggesterName)}
            </span>
            <span className={c('batch-date')}>
              {formatResolvedAt(batch.rows[0]?.resolvedAt ?? null)}
            </span>
          </header>
          {batch.rows.map((row) => (
            <TourSuggestionRow key={row.id} suggestion={row} mode={mode} />
          ))}
        </article>
      ))}
    </section>
  );
}
