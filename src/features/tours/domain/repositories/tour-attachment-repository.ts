import type { LocalFile } from '@/core/files';
import type { AllowedMimeType } from '@/features/tours/data/models/tour-attachment';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';

export interface NewAttachmentInput {
  /**
   * Minted by the CALLER before the upload starts (design D2/D5) — the storage path is
   * derived from it, so the picker can cache the bytes under their final key and paint
   * from them while the transfer is still running.
   */
  id: string;
  file: LocalFile;
  mimeType: AllowedMimeType;
  tourId: string;
  userId: string;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

/** Row-only insert for files already in Storage (create flow: upload now, insert after the tour row). */
export interface AttachmentRowInput {
  id: string;
  tourId: string;
  userId: string;
  storagePath: string;
  mimeType: AllowedMimeType;
  sizeBytes: number;
  originalFilename: string;
}

export interface TourAttachmentRepository {
  list: (tourId: string) => Promise<TourAttachment[]>;
  add: (input: NewAttachmentInput) => Promise<TourAttachment>;
  /** Upload the object only, returning its storage path. */
  uploadObject: (input: NewAttachmentInput) => Promise<string>;
  insertRow: (input: AttachmentRowInput) => Promise<TourAttachment>;
  remove: (attachment: TourAttachment) => Promise<void>;
  /** Best-effort delete of a storage object with no row behind it (cancel / abandoned draft). */
  removeObject: (storagePath: string) => Promise<void>;
  reorder: (tourId: string, orderedIds: string[]) => Promise<void>;
  getViewUrl: (storagePath: string) => Promise<string>;
  getDownloadUrl: (storagePath: string, originalFilename: string) => Promise<string>;
}
