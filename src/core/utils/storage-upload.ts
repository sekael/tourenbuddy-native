import { type LocalFile, readBlob } from '@/core/files';
import { supabase } from '@/core/supabase';

export interface UploadOptions {
  contentType?: string;
  upsert?: boolean;
  signal?: AbortSignal;
  /** Fraction transferred, 0..1. Only called when the transfer reports a total size. */
  onProgress?: (fraction: number) => void;
}

/**
 * Upload bytes to Supabase Storage with real progress and a real abort (design D3).
 *
 * `supabase.storage.upload()` takes neither an `AbortSignal` nor a progress callback. The
 * abort alone would be reason enough to drop to `fetch()`, but `fetch()` cannot report
 * UPLOAD progress — the only mechanism is a `ReadableStream` request body, which Safari does
 * not ship (nor does React Native). `XMLHttpRequest` is the one transport every target
 * browser supports with a per-transfer `upload.onprogress`. So: mint a signed upload URL —
 * the token rides the query string, so there is no auth header to manage — and `PUT` to it.
 *
 * Rejects with an error named `AbortError` when cancelled, so callers can tell a cancel
 * (silent) from a failure (retry row). Lives in `core/utils/` because a service (GPX) and
 * two repositories (attachments, suggestions) all use it, and `core/` may not import features.
 *
 * ponytail: one PUT per file, no chunking and no resume. A dropped connection restarts that
 * file through the UI's Retry — fine at the 10 MB per-file cap. Add resumable uploads only
 * if the cap rises.
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: Blob | LocalFile,
  opts: UploadOptions = {},
): Promise<void> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path, { upsert: opts.upsert ?? false });

  if (error || !data?.signedUrl)
    throw new Error(error?.message ?? 'Failed to create signed upload URL');

  // A picked file arrives as a URI; React Native's XHR sends a Blob read from it.
  const body = 'uri' in file ? await readBlob(file) : file;
  await putWithProgress(data.signedUrl, body, opts);
}

/** Hermes has no `DOMException`: an Error named `AbortError` is what callers check. */
function abortError(): Error {
  const error = new Error('Upload aborted');
  error.name = 'AbortError';
  return error;
}

/**
 * PUT `file` to `signedUrl`, reporting progress and honouring `signal`.
 *
 * The signed URL carries its own credential in the query string, so no auth header is set —
 * adding one is rejected. Body is the raw blob plus `Content-Type`, mirroring the non-Blob
 * branch of the SDK's own `uploadToSignedUrl`; the multipart branch it uses for Blobs would
 * store the envelope bytes unless the field name is exactly `''`.
 */
function putWithProgress(signedUrl: string, file: Blob, opts: UploadOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    // An already-aborted signal must never reach the network.
    if (opts.signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    // Guards the one-settle rule: abort-after-load and error-after-abort both fire twice.
    let settled = false;

    const onSignalAbort = () => xhr.abort();

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      // Without this, a completed upload leaves a listener holding a dead xhr alive.
      opts.signal?.removeEventListener('abort', onSignalAbort);
      fn();
    }

    xhr.open('PUT', signedUrl);
    // Headers are only settable after open().
    if (opts.contentType) xhr.setRequestHeader('Content-Type', opts.contentType);
    if (opts.upsert) xhr.setRequestHeader('x-upsert', 'true');
    // Matches the SDK default, so objects keep the cache-control they had before this
    // transport replaced `supabase.storage.upload()`.
    xhr.setRequestHeader('cache-control', 'max-age=3600');

    xhr.upload.onprogress = (e) => {
      // A chunked / unknown-length body reports no total — 0/0 would paint NaN.
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(e.loaded / e.total);
    };

    // `onload` fires for 4xx/5xx too — only transport failures reach `onerror`.
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      });
    xhr.onerror = () => settle(() => reject(new Error('Upload failed: network error')));
    xhr.onabort = () => settle(() => reject(abortError()));

    opts.signal?.addEventListener('abort', onSignalAbort);
    xhr.send(file);
  });
}
