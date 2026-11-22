import Storage from 'expo-sqlite/kv-store';

const KEY = 'app-language';

/**
 * The language picked in the app (Profile), kept on the device and read synchronously at launch,
 * so the first frame is already in it. None: the app follows the device's languages.
 */
export function readLanguageChoice(): string | null {
  try {
    return Storage.getItemSync(KEY);
  } catch {
    return null;
  }
}

export function writeLanguageChoice(code: string): void {
  try {
    Storage.setItemSync(KEY, code);
  } catch {
    // ponytail: unsaved, the app follows the device again at the next launch; nothing else breaks.
  }
}
