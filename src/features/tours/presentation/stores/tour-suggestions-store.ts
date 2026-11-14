import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import type { LocalFile } from '@/core/files';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { mutate } from '@/core/offline/mutate';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import {
  bucketForField,
  SupabaseTourSuggestionsRepository,
  type StagedBucket,
} from '@/features/tours/data/repositories/tour-suggestions-repository-impl';
import {
  groupIntoBatches,
  type SuggestionItem,
  type TourSuggestion,
} from '@/features/tours/domain/entities/tour-suggestion';

/**
 * Suggestions on tours (tour-suggestions), ported from the PWA's store: one query loads every row
 * the viewer may see (own tours' and own suggestions), the pending count per own tour feeds the
 * list badge and the detail; writes are online-only (the block form of `mutate`).
 */
const log = createLogger('TourSuggestionsStore');
const repository = new SupabaseTourSuggestionsRepository();

type State = {
  suggestions: TourSuggestion[];
  /** Derived, kept in state so selectors return a stable reference. */
  pendingCountByTour: Record<string, number>;
  loading: boolean;
  error: string | null;
  start: () => void;
  clear: () => void;
  load: () => Promise<void>;
  myPendingFor: (tourId: string) => TourSuggestion[];
  pendingBatchesFor: (tourId: string) => ReturnType<typeof groupIntoBatches>;
  resolvedBatchesFor: (tourId: string) => ReturnType<typeof groupIntoBatches>;
  submitBatch: (tourId: string, batchId: string, items: SuggestionItem[]) => Promise<unknown>;
  accept: (suggestion: TourSuggestion) => Promise<unknown>;
  acceptBatch: (batchId: string) => Promise<unknown>;
  decline: (id: string) => Promise<unknown>;
  withdraw: (id: string) => Promise<unknown>;
  uploadStaged: (bucket: StagedBucket, tourId: string, file: LocalFile) => Promise<string>;
};

const uid = () => sessionUser.getState().id;
let unsubscribe: (() => void) | null = null;
/** Staged paths already handed to the sweeper this session. */
const swept = new Set<string>();

function countPending(rows: TourSuggestion[]): Record<string, number> {
  const me = uid();
  const counts: Record<string, number> = {};
  for (const s of rows) {
    if (s.ownerId === me && s.status === 'pending') counts[s.tourId] = (counts[s.tourId] ?? 0) + 1;
  }
  return counts;
}

/** Deletes the staged files of the caller's own resolved suggestions: only the author may. */
async function sweepOwnStaged(rows: TourSuggestion[]) {
  const me = uid();
  if (!me) return;
  const targets: { bucket: StagedBucket; path: string }[] = [];
  for (const s of rows) {
    if (s.suggesterId !== me || s.status === 'pending') continue;
    const bucket = bucketForField(s.field);
    const path = (s.value as { storagePath?: string } | null)?.storagePath;
    if (!bucket || !path || !path.startsWith(`${me}/suggestions/`) || swept.has(path)) continue;
    swept.add(path);
    targets.push({ bucket, path });
  }
  if (targets.length === 0) return;
  await repository.sweepStaged(targets).catch((e) => log.warn('staged sweep failed', e));
}

export const useTourSuggestionsStore = create<State>()((set, get) => {
  async function resolve<T>(run: () => Promise<T>, fallback: string) {
    set({ error: null });
    return mutate(async () => {
      try {
        const result = await run();
        await get().load();
        return result;
      } catch (err) {
        set({ error: err instanceof Error ? err.message : fallback });
        log.error(fallback, err);
        throw err;
      }
    });
  }

  return {
    suggestions: [],
    pendingCountByTour: {},
    loading: false,
    error: null,

    start: () => {
      const me = uid();
      if (!me || unsubscribe) return;
      // Realtime filters cannot join: `owner_id` is on the row so the owner can subscribe.
      unsubscribe = subscribeRealtime({
        topic: `tour-suggestions:${me}`,
        postgres: [
          { event: '*', table: 'tour_suggestion', filter: `owner_id=eq.${me}` },
          { event: '*', table: 'tour_suggestion', filter: `suggester_id=eq.${me}` },
        ],
        onChange: () => void get().load(),
        onSubscribed: () => void get().load(),
      });
    },

    clear: () => {
      unsubscribe?.();
      unsubscribe = null;
      swept.clear();
      set({ suggestions: [], pendingCountByTour: {}, error: null, loading: false });
    },

    load: async () => {
      const me = uid();
      if (!me) return;
      set({ loading: true, error: null });
      try {
        // Cached: offline, an owner sees a stale but truthful pending count, not a silent zero.
        await cachedLoad(
          `suggestions:${me}`,
          () => repository.listForUser(),
          (rows) => {
            if (uid() === me) set({ suggestions: rows, pendingCountByTour: countPending(rows) });
          },
        );
        void sweepOwnStaged(get().suggestions);
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Failed to load suggestions' });
        log.error('load suggestions failed', err);
      } finally {
        set({ loading: false });
      }
    },

    myPendingFor: (tourId) =>
      get().suggestions.filter(
        (s) => s.tourId === tourId && s.suggesterId === uid() && s.status === 'pending',
      ),
    pendingBatchesFor: (tourId) =>
      groupIntoBatches(
        get().suggestions.filter((s) => s.tourId === tourId && s.status === 'pending'),
      ),
    resolvedBatchesFor: (tourId) =>
      groupIntoBatches(
        get().suggestions.filter((s) => s.tourId === tourId && s.status !== 'pending'),
      ),

    submitBatch: (tourId, batchId, items) =>
      resolve(() => repository.upsertBatch(tourId, batchId, items), 'Failed to submit suggestions'),
    accept: (suggestion) =>
      resolve(() => repository.accept(suggestion), 'Failed to accept suggestion'),
    acceptBatch: (batchId) => {
      const rows = get().suggestions.filter((s) => s.batchId === batchId && s.status === 'pending');
      return resolve(() => repository.acceptBatch(batchId, rows), 'Failed to accept suggestions');
    },
    decline: (id) => resolve(() => repository.decline(id), 'Failed to decline suggestion'),
    withdraw: (id) => resolve(() => repository.withdraw(id), 'Failed to withdraw suggestion'),
    uploadStaged: (bucket, tourId, file) => {
      const me = uid();
      if (!me) throw new Error('Not authenticated');
      return repository.uploadStaged(bucket, tourId, me, file);
    },
  };
});
