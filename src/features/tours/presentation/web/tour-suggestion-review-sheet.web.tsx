import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { MAX_ATTACHMENTS_PER_TOUR } from '@/features/tours/data/models/tour-attachment';
import type { Tour } from '@/features/tours/domain/entities/tour';
import type { TourSuggestion } from '@/features/tours/domain/entities/tour-suggestion';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';

import styles from './tour-suggestion-review-sheet.module.css';
import { TourSuggestionRow } from './tour-suggestion-row.web';

const c = classes(styles);

/**
 * ONE sheet, two modes: the owner adjudicates per row plus accept-all; the author sees the same
 * layout with Withdraw and a way back into the form to revise (design D12).
 */
export function TourSuggestionReviewSheet({
  tour,
  mode,
  onRevise,
}: {
  tour: Tour;
  mode: 'owner' | 'author';
  /** Author mode: reopen the form seeded with this batch's pending values. */
  onRevise: (batchId: string) => void;
}) {
  const { t } = useTranslation('web');
  const error = useTourSuggestionsStore((s) => s.error);
  useTourSuggestionsStore((s) => s.suggestions);
  const batches = useTourSuggestionsStore.getState().pendingBatchesFor(tour.id);
  const attachments = useTourAttachmentsStore((s) => s.attachmentsByTour[tour.id]) ?? [];
  const [busy, setBusy] = useState(false);
  const capFull = attachments.length >= MAX_ATTACHMENTS_PER_TOUR;

  /** The attachment count this batch would leave behind (D10: the cap is checked on the END state). */
  function projectedCount(rows: TourSuggestion[]): number {
    const live = new Set(attachments.map((a) => a.id));
    let count = attachments.length;
    for (const row of rows) {
      if (row.field === 'attachment_add') count += 1;
      // A removal whose target is already gone frees nothing (D3).
      else if (row.field === 'attachment_remove' && row.targetId && live.has(row.targetId))
        count -= 1;
    }
    return count;
  }
  /** Accept-all is refused for exactly the reason the server would refuse it. */
  const batchOverflows = (rows: TourSuggestion[]) =>
    projectedCount(rows) > MAX_ATTACHMENTS_PER_TOUR;

  // The cap decisions read the attachment list: load on entry and after each verdict.
  useEffect(() => void useTourAttachmentsStore.getState().load(tour.id), []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await useTourAttachmentsStore.getState().load(tour.id);
    } catch {
      // The store recorded the message in `error`; a failed accept-all rolls back server-side.
    } finally {
      setBusy(false);
    }
  }
  const store = useTourSuggestionsStore.getState();

  return (
    <section className={c('review')}>
      {error && <p className={c('review-error')}>{error}</p>}
      {batches.length === 0 && (
        <p className={c('empty')} data-testid="review-empty">
          {mode === 'owner'
            ? t('tours.suggestions.emptyOwner')
            : t('tours.suggestions.emptyAuthor')}
        </p>
      )}
      {batches.map((batch) => (
        <article key={batch.batchId} className={c('batch')}>
          <header className={c('batch-head')}>
            <BaseIcon name="feedback" />
            <span className={c('batch-author')}>
              {mode === 'owner'
                ? t('tours.suggestions.byAuthor', {
                    name: batch.suggesterName ?? t('tours.suggestions.aPartner'),
                  })
                : t('tours.suggestions.yourProposal')}
            </span>
            <span className={c('batch-count')}>
              {t('tours.suggestions.fieldCount', { count: batch.rows.length })}
            </span>
          </header>
          {batch.rows.map((row) => (
            <TourSuggestionRow
              key={row.id}
              suggestion={row}
              mode={mode}
              capFull={capFull}
              capRelief={!batchOverflows(batch.rows)}
              busy={busy}
              onAccept={(s) => void run(() => store.accept(s))}
              onDecline={(s) => void run(() => store.decline(s.id))}
              onWithdraw={(s) => void run(() => store.withdraw(s.id))}
            />
          ))}
          <div className={c('batch-actions')}>
            {mode === 'owner' && batchOverflows(batch.rows) && (
              <p className={c('batch-hint')} data-testid="accept-all-hint">
                {t('tours.suggestions.capHintBatch', { max: MAX_ATTACHMENTS_PER_TOUR })}
              </p>
            )}
            {mode === 'owner' ? (
              <BaseButton
                type="button"
                variant="primary"
                size="sm"
                disabled={busy || batchOverflows(batch.rows)}
                data-testid="accept-all-btn"
                onClick={() => void run(() => store.acceptBatch(batch.batchId))}
              >
                <BaseIcon name="check" />
                {t('tours.suggestions.acceptAllBtn')}
              </BaseButton>
            ) : (
              <BaseButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                data-testid="revise-btn"
                onClick={() => onRevise(batch.batchId)}
              >
                <BaseIcon name="edit" />
                {t('tours.suggestions.reviseBtn')}
              </BaseButton>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
