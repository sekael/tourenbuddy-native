import type { LocalFile } from '@/core/files';
import type {
  SuggestionItem,
  TourSuggestion,
} from '@/features/tours/domain/entities/tour-suggestion';

/** What a resolving RPC reports back (design D16): which batches are now fully resolved. */
export interface ResolveResult {
  /** Batch ids that hold no pending row any more — the author is notified once, here. */
  resolvedBatches: string[];
  tourId?: string;
  /** Fields applied by this call, for the `tour_updates` meaningful-change check. */
  fields: string[];
}

export interface TourSuggestionsRepository {
  /** All rows where the caller is the owner OR the author — one query serves the feature (D15). */
  listForUser: () => Promise<TourSuggestion[]>;
  /** Create AND revise: one idempotent reconciling call over the author's pending set (D12). */
  upsertBatch: (tourId: string, batchId: string, items: SuggestionItem[]) => Promise<void>;
  accept: (suggestion: TourSuggestion) => Promise<ResolveResult>;
  acceptBatch: (batchId: string, rows: TourSuggestion[]) => Promise<ResolveResult>;
  decline: (id: string) => Promise<ResolveResult>;
  withdraw: (id: string) => Promise<void>;
  /** Upload a staged blob into the author's own prefix (D9). Returns the storage path. */
  uploadStaged: (
    bucket: 'tour-gpx' | 'tour-attachments',
    tourId: string,
    userId: string,
    file: LocalFile,
  ) => Promise<string>;
  /** Best-effort delete of the author's own staged objects for resolved suggestions (D9). */
  sweepStaged: (
    paths: { bucket: 'tour-gpx' | 'tour-attachments'; path: string }[],
  ) => Promise<void>;
}
