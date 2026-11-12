import type { UploadOptions } from '@/core/utils/storage-upload';
import { uploadWithProgress } from '@/core/utils/storage-upload';
import { type LocalFile, shareRemoteFile } from '@/core/files';
import { supabase } from '@/core/supabase';

const BUCKET = 'tour-gpx';
const SIGNED_URL_EXPIRES_IN = 3600;

/**
 * Storage key for one GPX file — mintable client-side (offline) before upload. `id` is fresh per
 * file (a new tour's id, else a random uuid): a key is written once (`loadGpxTrack`).
 */
export function gpxStorageKey(userId: string, id: string): string {
  return `${userId}/${id}.gpx`;
}

/**
 * Upload GPX bytes to an already-known key (used by offline replay, where the key was minted
 * at pick-time).
 *
 * Routed through the shared XHR transport so one upload path exists app-wide and the picker
 * can show real progress instead of an indeterminate spinner. Every pick mints a fresh key, so
 * an upload never changes another track's bytes (the parsed-track cache is keyed by path,
 * `loadGpxTrack`). `upsert` stays on for the same key's retries — an offline replay re-uploads
 * its staged blob until the row write lands. The signed upload URL carries it as the `x-upsert`
 * header, and an overwrite needs an UPDATE storage policy on top of INSERT — `tour-gpx owner
 * update` in `20260510064254_storage_buckets_and_policies.sql` provides it.
 *
 * `opts` is deliberately narrowed: `contentType` and `upsert` are properties of the GPX key
 * itself, not of a single call, so no caller may override them.
 */
export async function uploadGpxToKey(
  key: string,
  file: Blob | LocalFile,
  opts: Pick<UploadOptions, 'signal' | 'onProgress'> = {},
): Promise<void> {
  await uploadWithProgress(BUCKET, key, file, {
    // Spread FIRST: the two fixed fields must win over anything a caller passes.
    ...opts,
    contentType: 'application/gpx+xml',
    upsert: true,
  });
}

export async function uploadGpx(
  userId: string,
  tourId: string,
  file: Blob | LocalFile,
  opts: Pick<UploadOptions, 'signal' | 'onProgress'> = {},
): Promise<string> {
  const key = gpxStorageKey(userId, tourId);
  await uploadGpxToKey(key, file, opts);
  return key;
}

export async function removeGpx(filepath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([filepath]);
  if (error) throw new Error(error.message);
}

export async function getSignedUrl(filepath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filepath, SIGNED_URL_EXPIRES_IN);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Failed to get signed URL');
  return data.signedUrl;
}

/** Hands the original `.gpx` to the share sheet (Files, AirDrop, Mail); a download on the web. */
export async function shareOriginal(filepath: string, fallbackName: string): Promise<void> {
  const name = fallbackName.endsWith('.gpx') ? fallbackName : `${fallbackName}.gpx`;
  await shareRemoteFile(
    await getSignedUrl(filepath),
    name,
    'application/gpx+xml',
    'com.topografix.gpx',
  );
}
