import { z } from 'zod';

export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const HEIC_MIME_TYPES = ['image/heic', 'image/heif'] as const;

export const MAX_ATTACHMENT_SIZE_BYTES = 10_485_760; // 10 MB
export const MAX_ATTACHMENTS_PER_TOUR = 5;

/** Raw row from Supabase `tour_attachments` table. */
export const tourAttachmentRowSchema = z
  .object({
    id: z.string().guid(),
    tour_id: z.string().guid(),
    user_id: z.string().guid(),
    storage_path: z.string(),
    mime_type: z.enum(ALLOWED_MIME_TYPES),
    size_bytes: z.number().int().positive(),
    original_filename: z.string(),
    sort_order: z.number().int(),
    created_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    tourId: row.tour_id,
    userId: row.user_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    originalFilename: row.original_filename,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at),
  }));

export type TourAttachmentRow = z.infer<typeof tourAttachmentRowSchema>;
