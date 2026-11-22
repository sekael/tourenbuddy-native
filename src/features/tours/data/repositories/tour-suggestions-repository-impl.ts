import { type LocalFile, newId } from '@/core/files';
import type {
  SuggestionItem,
  TourSuggestion,
} from '@/features/tours/domain/entities/tour-suggestion';
import type {
  ResolveResult,
  TourSuggestionsRepository,
} from '@/features/tours/domain/repositories/tour-suggestions-repository';
import { createLogger } from '@/core/logging/logger';
import { uploadWithProgress } from '@/core/utils/storage-upload';
import { supabase } from '@/core/supabase';
import { tourSuggestionRowSchema } from '@/features/tours/data/models/tour-suggestion';
import { gpxStorageKey } from '@/features/tours/data/services/gpx-storage-service';

const logger = createLogger('tour-suggestions-repository');

export type StagedBucket = 'tour-gpx' | 'tour-attachments';
interface StagedObject {
  bucket: StagedBucket;
  path: string;
}
/** A PostgREST (`PGRST…`) or Postgres (SQLSTATE) code: the server answered, the call rolled back. */
const SERVER_ERROR_CODE = /^(?:PGRST\d+|[0-9A-Z]{5})$/;

/**
 * A replaced owner object's bucket, by its key's shape: an attachment is `<uid>/<tourId>/<id>.<ext>`
 * (`attachmentStoragePath`), a GPX `<uid>/<id>.gpx` (`gpxStorageKey`).
 */
function ownerBucketOf(path: string): StagedBucket {
  return path.split('/').length >= 3 ? 'tour-attachments' : 'tour-gpx';
}

/** Which bucket a staged blob for this field lives in. */
export function bucketForField(field: string): StagedBucket | null {
  if (field === 'gpx') return 'tour-gpx';
  if (field === 'attachment_add') return 'tour-attachments';
  return null;
}

/**
 * The suggester's own prefix (design D9). The first path segment is their uid, so the
 * EXISTING owner-insert storage policy already permits the write — no new INSERT policy,
 * no weakening of anyone's isolation.
 */
export function stagedPath(userId: string, tourId: string, ext: string): string {
  return `${userId}/suggestions/${tourId}/${newId()}${ext}`;
}

function extOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot) : '';
}

function storagePathOf(row: TourSuggestion): string | null {
  const value = row.value as { storagePath?: string } | null;
  return value?.storagePath ?? null;
}

export class SupabaseTourSuggestionsRepository implements TourSuggestionsRepository {
  async listForUser(): Promise<TourSuggestion[]> {
    // One query for the whole feature (D15) — the same predicate as the SELECT policy and
    // the realtime filters, so RLS alone scopes it and no `.or(...)` filter is needed.
    const { data, error } = await supabase
      .from('tour_suggestion_view')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => tourSuggestionRowSchema.parse(row));
  }

  async upsertBatch(tourId: string, batchId: string, items: SuggestionItem[]): Promise<void> {
    const { error } = await supabase.rpc('upsert_tour_suggestions', {
      p_tour_id: tourId,
      p_batch_id: batchId,
      p_items: items.map((i) => ({ field: i.field, value: i.value, targetId: i.targetId ?? null })),
    });

    if (error) throw new Error(error.message);
  }

  async accept(suggestion: TourSuggestion): Promise<ResolveResult> {
    const copy = await this.copyStagedToOwner(suggestion);

    const { data, error } = await supabase.rpc('accept_tour_suggestion', {
      p_id: suggestion.id,
      p_storage_path: copy?.path ?? null,
    });

    if (error) throw await this.discardCopies(copy ? [copy] : [], error);

    const result = (data ?? {}) as Record<string, unknown>;
    await this.sweepOwnerLeftovers(
      [result.removed_storage_path as string | null],
      suggestion.field,
    );

    return {
      resolvedBatches: (result.resolved_batches as string[]) ?? [],
      tourId: result.tour_id as string | undefined,
      fields: [suggestion.field],
    };
  }

  async acceptBatch(batchId: string, rows: TourSuggestion[]): Promise<ResolveResult> {
    // Copy every staged blob into the owner's prefix FIRST, then hand the map to the RPC,
    // which applies the whole review in one transaction (D10).
    const copies: StagedObject[] = [];
    const paths: Record<string, string> = {};
    try {
      for (const row of rows) {
        const copy = await this.copyStagedToOwner(row);
        if (copy) {
          copies.push(copy);
          paths[row.id] = copy.path;
        }
      }
    } catch (err) {
      // Nothing points at the copies yet.
      await this.removeObjects(copies);
      throw err;
    }

    const { data, error } = await supabase.rpc('accept_tour_suggestion_batch', {
      p_batch_id: batchId,
      p_storage_paths: paths,
    });

    if (error) throw await this.discardCopies(copies, error);

    const result = (data ?? {}) as Record<string, unknown>;
    // A replaced GPX comes back here too, next to removed attachments.
    const removed = (result.removed_storage_paths as string[] | null) ?? [];
    await this.removeObjects(removed.map((path) => ({ bucket: ownerBucketOf(path), path })));

    return {
      resolvedBatches: (result.resolved_batches as string[]) ?? [],
      tourId: result.tour_id as string | undefined,
      fields: (result.fields as string[]) ?? [],
    };
  }

  async decline(id: string): Promise<ResolveResult> {
    const { data, error } = await supabase.rpc('decline_tour_suggestion', { p_id: id });

    if (error) throw new Error(error.message);

    return {
      resolvedBatches: ((data ?? {}) as { resolved_batches?: string[] }).resolved_batches ?? [],
      fields: [],
    };
  }

  async withdraw(id: string): Promise<void> {
    const { error } = await supabase.rpc('withdraw_tour_suggestion', { p_id: id });

    if (error) throw new Error(error.message);
  }

  async uploadStaged(
    bucket: StagedBucket,
    tourId: string,
    userId: string,
    file: LocalFile,
  ): Promise<string> {
    const path = stagedPath(
      userId,
      tourId,
      extOf(file.name) || (bucket === 'tour-gpx' ? '.gpx' : ''),
    );
    // One upload transport across the app (design D3). Transport only — staging must NOT
    // write into the attachments store's `pendingByTour` (cross-feature store reach, D4).
    await uploadWithProgress(bucket, path, file, {
      contentType: file.type || 'application/octet-stream',
    });

    return path;
  }

  async sweepStaged(paths: StagedObject[]): Promise<void> {
    await this.removeObjects(paths);
  }

  /** Best-effort delete of objects, one request per bucket. */
  private async removeObjects(paths: StagedObject[]): Promise<void> {
    const byBucket = new Map<StagedBucket, string[]>();
    for (const { bucket, path } of paths)
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);

    for (const [bucket, list] of byBucket) {
      const { error } = await supabase.storage
        .from(bucket)
        .remove(list)
        .catch((err: Error) => ({ error: err }));
      if (error) logger.warn('Storage objects not removed (orphaned)', { bucket, list, error });
    }
  }

  /**
   * Server-side copy of a staged blob into the OWNER's own prefix (D9), so the accepted
   * row never points at the suggester's prefix — where the owner's read grant expires
   * with the suggestion. Needs read on the source (the pending-scoped SELECT policy) and
   * insert on the destination (the owner's existing policy).
   *
   * Every copy lands at a fresh key; a failed accept discards its copies (`discardCopies`).
   * Known ceiling: a crash, or a lost response, between the copy and the RPC orphans one
   * object in the owner's prefix. Same exposure as the existing upload-then-write window in
   * the attachment picker.
   */
  private async copyStagedToOwner(row: TourSuggestion): Promise<StagedObject | null> {
    const bucket = bucketForField(row.field);
    const staged = storagePathOf(row);
    if (!bucket || !staged) return null;

    const ownPath =
      bucket === 'tour-gpx'
        ? // A fresh key, never the tour's own `<uid>/<tourId>.gpx`: a tour created with a track
          // already holds that path, and it is swept as the replaced file right after.
          gpxStorageKey(row.ownerId, newId())
        : `${row.ownerId}/${row.tourId}/${newId()}${extOf(staged)}`;

    const { error } = await supabase.storage.from(bucket).copy(staged, ownPath);
    if (error) throw new Error(error.message);

    return { bucket, path: ownPath };
  }

  /**
   * An accept that failed: drop the copies made for it and hand back the error to throw. Only
   * when the outcome is known — a server answer carries a code and rolled back. A lost response
   * (no code) may have committed, the row then pointing at a copy: keep it (orphan at worst).
   */
  private async discardCopies(
    copies: StagedObject[],
    error: { code?: string; message: string },
  ): Promise<Error> {
    if (SERVER_ERROR_CODE.test(error.code ?? '')) await this.removeObjects(copies);
    return new Error(error.message);
  }

  /** The tour's previous GPX object after a replace, or the removed attachment's bytes. */
  private async sweepOwnerLeftovers(paths: (string | null)[], field: string): Promise<void> {
    const bucket = field === 'gpx' ? 'tour-gpx' : 'tour-attachments';
    for (const path of paths) {
      if (path)
        await supabase.storage
          .from(bucket)
          .remove([path])
          .catch(() => {});
    }
  }
}
