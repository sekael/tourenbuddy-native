import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';

/**
 * A file the user picked (document or image picker), or one the app wrote: what the PWA's `File`
 * carried, minus the bytes. Read it with `readText`/`readBlob`.
 */
export type LocalFile = { uri: string; name: string; type: string; size: number };

/** A fresh client-minted id (uuid v4), the same shape the PWA got from `crypto.randomUUID()`. */
export const newId = (): string => randomUUID();

/** The bytes of a local file as a Blob, the body the upload transport sends. */
export async function readBlob(file: Pick<LocalFile, 'uri'>): Promise<Blob> {
  return (await fetch(file.uri)).blob();
}

/** The text of a local file (a GPX, a vCard). */
export async function readText(file: Pick<LocalFile, 'uri'>): Promise<string> {
  return (await fetch(file.uri)).text();
}

/** Lowercase name safe as a file name on every platform. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'file';
}

/**
 * Downloads `url` into the cache under `name` (replacing an older copy), for the share sheet or the
 * system preview. Native only: the web downloads through the browser instead (`shareRemoteFile`).
 */
export async function downloadToCache(url: string, folder: string, name: string): Promise<File> {
  const dir = new Directory(Paths.cache, folder);
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, safeFileName(name));
  if (target.exists) target.delete();
  return File.downloadFileAsync(url, target);
}

/**
 * Hands a remote file (behind a signed URL) to the user: the system share sheet on iOS and
 * Android (Save to Files, AirDrop, Mail), a browser download on the web.
 */
export async function shareRemoteFile(
  url: string,
  name: string,
  mimeType: string,
  uti?: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const file = await downloadToCache(url, 'share', name);
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: name });
}
