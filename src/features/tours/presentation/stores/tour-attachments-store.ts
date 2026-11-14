import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { newId, type LocalFile } from '@/core/files';
import i18n from '@/core/i18n';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { cacheLocalFile, evictCachedFile, loadCachedFile } from '@/core/offline/file-cache';
import { mutate } from '@/core/offline/mutate';
import {
  ALLOWED_MIME_TYPES,
  HEIC_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_TOUR,
  type AllowedMimeType,
} from '@/features/tours/data/models/tour-attachment';
import {
  attachmentStoragePath,
  SupabaseTourAttachmentRepository,
} from '@/features/tours/data/repositories/tour-attachment-repository-impl';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';

/**
 * A tour's files (tour-attachments), ported from the PWA's store: PNG, JPEG and PDF up to 10 MB,
 * five per tour, names de-duplicated at pick time, uploads with progress, cancel and retry from the
 * cached bytes, delete and reorder; online only (DC10). Bytes are read cache-first and picked files
 * are cached before they upload, so they show at once and offline afterwards.
 *
 * Create flow: files upload at pick time to the tour's pre-minted id (`preUpload`), and their rows
 * are inserted once the tour row exists (`commitStaged`); an abandoned form discards them.
 */
const log = createLogger('TourAttachmentsStore');
const repository = new SupabaseTourAttachmentRepository();

export type AttachmentError =
  | { code: 'heic_unsupported' }
  | { code: 'invalid_type'; mimeType: string }
  | { code: 'too_large'; sizeBytes: number }
  | { code: 'limit_reached'; remaining: number; selected: number };

/** A file uploading right now; counted against the cap, not yet a row. */
export type PendingUpload = {
  id: string;
  tourId: string;
  draftId?: string;
  filename: string;
  storagePath: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  /** 0..1 */
  progress: number;
  status: 'uploading' | 'failed';
  /** The picked file, kept for a retry. */
  uri: string;
};

type PreUploaded = {
  id: string;
  storagePath: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  originalFilename: string;
};

type State = {
  attachmentsByTour: Record<string, TourAttachment[]>;
  pendingByTour: Record<string, PendingUpload[]>;
  preUploadedByDraft: Record<string, PreUploaded[]>;
  /** Files a partner proposes (suggestions), in memory until the suggestion uploads them. */
  stagedByDraft: Record<string, LocalFile[]>;
  loading: boolean;
  error: string | null;
  load: (tourId: string) => Promise<void>;
  add: (tourId: string, files: LocalFile[]) => Promise<unknown>;
  preUpload: (draftId: string, tourId: string, files: LocalFile[]) => Promise<unknown>;
  retryUpload: (id: string) => Promise<void>;
  cancelUpload: (id: string) => void;
  dismissUpload: (id: string) => void;
  commitStaged: (draftId: string, tourId: string) => Promise<void>;
  discardDraft: (draftId: string, tourId: string | null) => Promise<void>;
  stage: (draftId: string, files: LocalFile[], baseCount?: number) => void;
  clearStaged: (draftId: string) => void;
  remove: (attachment: TourAttachment) => Promise<unknown>;
  reorder: (tourId: string, orderedIds: string[]) => Promise<unknown>;
  /** A local copy for the system preview: cached, else downloaded; throws when unavailable. */
  localUri: (attachment: Pick<TourAttachment, 'storagePath'>) => Promise<string>;
  clearError: () => void;
  clear: () => void;
};

const controllers = new Map<string, AbortController>();
/** Bumped by every write, so a slower read never overwrites it. */
let writeSeq = 0;

const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

/** `image.jpg` → `image1.jpg` when taken; a free name is returned as it is. */
export function uniqueFilename(taken: Set<string>, name: string): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 1;
  while (taken.has(`${base}${n}${ext}`)) n++;
  return `${base}${n}${ext}`;
}

export function validateBatch(files: LocalFile[], currentCount: number): AttachmentError | null {
  for (const file of files) {
    if ((HEIC_MIME_TYPES as readonly string[]).includes(file.type)) {
      return { code: 'heic_unsupported' };
    }
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      return { code: 'invalid_type', mimeType: file.type };
    }
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return { code: 'too_large', sizeBytes: file.size };
  }
  if (currentCount + files.length > MAX_ATTACHMENTS_PER_TOUR) {
    return {
      code: 'limit_reached',
      remaining: Math.max(0, MAX_ATTACHMENTS_PER_TOUR - currentCount),
      selected: files.length,
    };
  }
  return null;
}

export function errorMessage(e: AttachmentError): string {
  switch (e.code) {
    case 'heic_unsupported':
      return i18n.t('tours.attachments.heicUnsupported');
    case 'invalid_type':
      return i18n.t('tours.attachments.invalidType');
    case 'too_large':
      return i18n.t('tours.attachments.tooLarge');
    case 'limit_reached':
      return e.remaining === 0
        ? i18n.t('tours.attachments.limitReached')
        : i18n.t('tours.attachments.limitRemaining', {
            remaining: e.remaining,
            selected: e.selected,
          });
  }
}

export const useTourAttachmentsStore = create<State>()((set, get) => {
  const occupied = (tourId: string | null, draftId?: string) =>
    (tourId ? (get().attachmentsByTour[tourId] ?? []).length : 0) +
    (tourId ? (get().pendingByTour[tourId] ?? []).length : 0) +
    (draftId ? (get().preUploadedByDraft[draftId] ?? []).length : 0) +
    (draftId ? (get().stagedByDraft[draftId] ?? []).length : 0);

  const takenNames = (tourId: string | null, draftId?: string) =>
    new Set([
      ...(tourId ? (get().attachmentsByTour[tourId] ?? []).map((a) => a.originalFilename) : []),
      ...(tourId ? (get().pendingByTour[tourId] ?? []).map((p) => p.filename) : []),
      ...(draftId ? (get().stagedByDraft[draftId] ?? []).map((f) => f.name) : []),
      ...(draftId ? (get().preUploadedByDraft[draftId] ?? []).map((p) => p.originalFilename) : []),
    ]);

  const patchPending = (entry: PendingUpload, patch: Partial<PendingUpload> | null) =>
    set((s) => {
      const list = s.pendingByTour[entry.tourId] ?? [];
      return {
        pendingByTour: {
          ...s.pendingByTour,
          [entry.tourId]: patch
            ? list.map((p) => (p.id === entry.id ? { ...p, ...patch } : p))
            : list.filter((p) => p.id !== entry.id),
        },
      };
    });

  const findPending = (id: string) =>
    Object.values(get().pendingByTour)
      .flat()
      .find((p) => p.id === id);

  /** A failure as text; a cap rejection is recounted from a fresh list first. */
  async function reportFailure(error: unknown, tourId: string) {
    log.error('attachment upload failed', error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('tour_attachment_limit_exceeded')) {
      await get().load(tourId);
      const count = (get().attachmentsByTour[tourId] ?? []).length;
      set({
        error: i18n.t('tours.attachments.limitRemaining', {
          remaining: Math.max(0, MAX_ATTACHMENTS_PER_TOUR - count),
          selected: 1,
        }),
      });
      return;
    }
    set({ error: i18n.t('tours.attachments.uploadFailed') });
  }

  /** One file, settling on its own: one failure never aborts its siblings. */
  async function runUpload(entry: PendingUpload, userId: string) {
    const controller = new AbortController();
    controllers.set(entry.id, controller);
    patchPending(entry, { status: 'uploading', progress: 0 });
    const input = {
      id: entry.id,
      file: { uri: entry.uri, name: entry.filename, type: entry.mimeType, size: entry.sizeBytes },
      mimeType: entry.mimeType,
      tourId: entry.tourId,
      userId,
      signal: controller.signal,
      onProgress: (progress: number) => patchPending(entry, { progress }),
    };
    try {
      if (entry.draftId) {
        // Create flow: the object now, the row once the tour row exists (FK).
        await repository.uploadObject(input);
        const draftId = entry.draftId;
        set((s) => ({
          preUploadedByDraft: {
            ...s.preUploadedByDraft,
            [draftId]: [
              ...(s.preUploadedByDraft[draftId] ?? []).filter((a) => a.id !== entry.id),
              {
                id: entry.id,
                storagePath: entry.storagePath,
                mimeType: entry.mimeType,
                sizeBytes: entry.sizeBytes,
                originalFilename: entry.filename,
              },
            ],
          },
        }));
      } else {
        const row = await repository.add(input);
        writeSeq++;
        set((s) => ({
          attachmentsByTour: {
            ...s.attachmentsByTour,
            [entry.tourId]: [
              ...(s.attachmentsByTour[entry.tourId] ?? []).filter((a) => a.id !== row.id),
              row,
            ],
          },
        }));
      }
      patchPending(entry, null);
    } catch (error) {
      if (isAbort(error)) {
        // A cancel is not a failure: no message, siblings untouched.
        patchPending(entry, null);
        discardObject(entry.storagePath);
        return;
      }
      patchPending(entry, { status: 'failed' });
      await reportFailure(error, entry.tourId);
    } finally {
      controllers.delete(entry.id);
    }
  }

  function discardObject(storagePath: string) {
    evictCachedFile(storagePath);
    void repository.removeObject(storagePath).catch(() => {});
  }

  async function startUploads(tourId: string, files: LocalFile[], draftId?: string) {
    const userId = sessionUser.getState().id;
    if (!userId) return;
    const taken = takenNames(tourId, draftId);
    const entries = files.map((file) => {
      const filename = uniqueFilename(taken, file.name);
      taken.add(filename);
      const id = newId();
      const mimeType = file.type as AllowedMimeType;
      const storagePath = attachmentStoragePath(userId, tourId, id, mimeType);
      // Cached before the upload, so the strip shows the bytes at once.
      cacheLocalFile(storagePath, file.uri);
      return {
        id,
        tourId,
        draftId,
        filename,
        storagePath,
        mimeType,
        sizeBytes: file.size,
        progress: 0,
        status: 'uploading' as const,
        uri: file.uri,
      };
    });
    set((s) => ({
      pendingByTour: {
        ...s.pendingByTour,
        [tourId]: [...(s.pendingByTour[tourId] ?? []), ...entries],
      },
    }));
    await Promise.all(entries.map((entry) => runUpload(entry, userId)));
  }

  return {
    attachmentsByTour: {},
    pendingByTour: {},
    preUploadedByDraft: {},
    stagedByDraft: {},
    loading: false,
    error: null,

    load: async (tourId) => {
      set({ loading: true, error: null });
      const seq = writeSeq;
      try {
        await cachedLoad(
          `attachments:${tourId}`,
          () => repository.list(tourId),
          (rows) => {
            if (seq !== writeSeq) return; // a write landed meanwhile: it wins
            set((s) => ({ attachmentsByTour: { ...s.attachmentsByTour, [tourId]: rows } }));
          },
        );
      } catch (error) {
        set({ error: i18n.t('tours.attachments.loadFailed') });
        log.error('load attachments failed', error);
      } finally {
        set({ loading: false });
      }
    },

    add: async (tourId, files) => {
      const invalid = validateBatch(files, occupied(tourId));
      if (invalid) {
        set({ error: errorMessage(invalid) });
        return;
      }
      set({ error: null });
      return mutate(() => startUploads(tourId, files));
    },

    preUpload: async (draftId, tourId, files) => {
      const invalid = validateBatch(files, occupied(tourId, draftId));
      if (invalid) {
        set({ error: errorMessage(invalid) });
        return;
      }
      set({ error: null });
      return mutate(() => startUploads(tourId, files, draftId));
    },

    retryUpload: async (id) => {
      const entry = findPending(id);
      const userId = sessionUser.getState().id;
      if (!entry || !userId || entry.status !== 'failed') return;
      set({ error: null });
      await runUpload(entry, userId);
    },

    cancelUpload: (id) => controllers.get(id)?.abort(),

    dismissUpload: (id) => {
      const entry = findPending(id);
      if (!entry) return;
      controllers.get(id)?.abort();
      patchPending(entry, null);
      discardObject(entry.storagePath);
    },

    commitStaged: async (draftId, tourId) => {
      const uploaded = get().preUploadedByDraft[draftId];
      const userId = sessionUser.getState().id;
      if (!uploaded?.length || !userId) return;
      set({ loading: true, error: null });
      try {
        const rows: TourAttachment[] = [];
        for (const file of uploaded) {
          rows.push(
            await repository.insertRow({
              id: file.id,
              tourId,
              userId,
              storagePath: file.storagePath,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              originalFilename: file.originalFilename,
            }),
          );
        }
        writeSeq++;
        set((s) => {
          const { [draftId]: _done, ...rest } = s.preUploadedByDraft;
          return {
            preUploadedByDraft: rest,
            attachmentsByTour: {
              ...s.attachmentsByTour,
              [tourId]: [...(s.attachmentsByTour[tourId] ?? []), ...rows],
            },
          };
        });
      } catch (error) {
        await reportFailure(error, tourId);
      } finally {
        set({ loading: false });
      }
    },

    discardDraft: async (draftId, tourId) => {
      if (tourId) {
        for (const entry of get().pendingByTour[tourId] ?? []) {
          if (entry.draftId !== draftId) continue;
          controllers.get(entry.id)?.abort();
          patchPending(entry, null);
          discardObject(entry.storagePath);
        }
      }
      const uploaded = get().preUploadedByDraft[draftId] ?? [];
      set((s) => {
        const { [draftId]: _u, ...pre } = s.preUploadedByDraft;
        const { [draftId]: _s, ...staged } = s.stagedByDraft;
        return { preUploadedByDraft: pre, stagedByDraft: staged };
      });
      uploaded.forEach((f) => discardObject(f.storagePath));
    },

    stage: (draftId, files, baseCount = 0) => {
      const current = get().stagedByDraft[draftId] ?? [];
      const invalid = validateBatch(files, current.length + baseCount);
      if (invalid) {
        set({ error: errorMessage(invalid) });
        return;
      }
      const taken = takenNames(null, draftId);
      const named = files.map((f) => {
        const name = uniqueFilename(taken, f.name);
        taken.add(name);
        return { ...f, name };
      });
      set((s) => ({
        error: null,
        stagedByDraft: { ...s.stagedByDraft, [draftId]: [...current, ...named] },
      }));
    },

    clearStaged: (draftId) =>
      set((s) => {
        const { [draftId]: _s, ...rest } = s.stagedByDraft;
        return { stagedByDraft: rest };
      }),

    remove: (attachment) => {
      set({ error: null });
      return mutate(async () => {
        try {
          await repository.remove(attachment);
          writeSeq++;
          evictCachedFile(attachment.storagePath);
          set((s) => ({
            attachmentsByTour: {
              ...s.attachmentsByTour,
              [attachment.tourId]: (s.attachmentsByTour[attachment.tourId] ?? []).filter(
                (a) => a.id !== attachment.id,
              ),
            },
          }));
        } catch (error) {
          set({ error: i18n.t('tours.infoSheet.deleteFailed') });
          log.error('remove attachment failed', error);
        }
      });
    },

    reorder: (tourId, orderedIds) => {
      set({ error: null });
      return mutate(async () => {
        try {
          await repository.reorder(tourId, orderedIds);
          writeSeq++;
          set((s) => {
            const byId = new Map((s.attachmentsByTour[tourId] ?? []).map((a) => [a.id, a]));
            return {
              attachmentsByTour: {
                ...s.attachmentsByTour,
                [tourId]: orderedIds
                  .filter((id) => byId.has(id))
                  .map((id, sortOrder) => ({ ...byId.get(id)!, sortOrder })),
              },
            };
          });
        } catch (error) {
          set({ error: i18n.t('tours.infoSheet.saveFailed') });
          log.error('reorder attachments failed', error);
        }
      });
    },

    localUri: async ({ storagePath }) => {
      const uri = await loadCachedFile(storagePath, () => repository.getViewUrl(storagePath));
      if (!uri) throw new Error('Attachment unavailable offline');
      return uri;
    },

    clearError: () => set({ error: null }),

    clear: () => {
      controllers.forEach((c) => c.abort());
      controllers.clear();
      set({
        attachmentsByTour: {},
        pendingByTour: {},
        preUploadedByDraft: {},
        stagedByDraft: {},
        error: null,
        loading: false,
      });
    },
  };
});
