import type { z } from 'zod';
import type {
  suggestionFieldSchema,
  suggestionStatusSchema,
  tourSuggestionRowSchema,
} from '@/features/tours/data/models/tour-suggestion';

/** One logical field a partner proposes changing. The field IS the aggregate (design D1). */
export type TourSuggestion = z.infer<typeof tourSuggestionRowSchema>;

export type SuggestionField = z.infer<typeof suggestionFieldSchema>;
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;

/** One submit = one review the owner adjudicates as a unit (`batch_id`). */
export interface SuggestionBatch {
  batchId: string;
  tourId: string;
  suggesterId: string;
  /** Display name of the author, resolved by the view (owners can't read a friend's profile). */
  suggesterName: string | null;
  createdAt: Date;
  rows: TourSuggestion[];
}

/** The item shape `upsert_tour_suggestions` takes — one per changed logical field. */
export interface SuggestionItem {
  field: SuggestionField;
  /** `null` is a real suggestion ("clear this field"), never "unchanged" (D1). */
  value: unknown;
  /** `attachment_remove` only: the existing attachment being proposed for removal. */
  targetId?: string | null;
}

/** Groups rows into batches, newest first, for the review and history sheets. */
export function groupIntoBatches(rows: TourSuggestion[]): SuggestionBatch[] {
  const byBatch = new Map<string, SuggestionBatch>();
  for (const row of rows) {
    const existing = byBatch.get(row.batchId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    byBatch.set(row.batchId, {
      batchId: row.batchId,
      tourId: row.tourId,
      suggesterId: row.suggesterId,
      suggesterName:
        [row.suggesterFirstName, row.suggesterLastName].filter(Boolean).join(' ') || null,
      createdAt: row.createdAt,
      rows: [row],
    });
  }
  return [...byBatch.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
