import type { LocalFile } from '@/core/files';

/** A picked browser `File` as the shared stores take it (the native pickers' shape). */
export const localFileOf = (file: File): LocalFile => ({
  uri: URL.createObjectURL(file),
  name: file.name,
  type: file.type,
  size: file.size,
});
