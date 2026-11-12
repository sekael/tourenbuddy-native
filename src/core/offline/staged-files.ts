import { cachedUri, stageFileText, unstageFile } from './file-cache';
import { tables } from './tables';

/**
 * A GPX picked offline (offline-write-sync): its text is staged in the file cache under the storage
 * key it will have, so the map shows it at once, and a `pending-upload:<key>` marker tells the tour
 * replay to upload it before writing the row. Attachments stay online-only (DC10).
 */
export async function stageText(key: string, text: string): Promise<void> {
  stageFileText(key, text);
  await (await tables()).put('cache', `pending-upload:${key}`, 'true');
}

export async function isPendingUpload(key: string): Promise<boolean> {
  return (await (await tables()).get('cache', `pending-upload:${key}`)) === 'true';
}

export async function clearPendingUpload(key: string): Promise<void> {
  await (await tables()).delete('cache', `pending-upload:${key}`);
  unstageFile(key);
}

/** The staged file's local URI, for the upload on replay. */
export const stagedUri = (key: string): string | undefined => cachedUri(key);
