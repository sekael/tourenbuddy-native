import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

// Readable whenever the phone has been unlocked once since a restart, so a token refresh landing
// while it is locked can still be saved; never moved to another device by a backup.
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Resolves once storage can be read. iOS may launch the app in the background after a restart,
 * before the first unlock (prewarming), when the Keychain and the app's files are still locked:
 * a read then finds no session and no marker. In the foreground the phone is unlocked.
 */
export const storageReady = new Promise<void>((resolve) => {
  if (AppState.currentState !== 'background') return resolve();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    subscription.remove();
    resolve();
  });
});

// The iOS Keychain keeps items after the app is deleted; the document directory does not. Without
// the marker this is a new install, so a session left by an earlier one is deleted before anything
// reads it, and a reinstalled app starts signed out.
const marker = new File(Paths.document, 'installed');
let reinstalled: boolean | undefined;
const forgetting = new Map<string, Promise<void>>();

async function forgetLeftover(key: string) {
  await storageReady;
  reinstalled ??= !marker.exists;
  if (!reinstalled) return;
  let done = forgetting.get(key);
  if (!done) {
    done = SecureStore.deleteItemAsync(key, options).then(() => marker.create({ overwrite: true }));
    // A failure (Keychain busy) fails this call only; the next one tries again.
    done.catch(() => forgetting.delete(key));
    forgetting.set(key, done);
  }
  await done;
}

/** auth-js storage on iOS and Android: the Keychain and Keystore-encrypted preferences. */
export const authStorage = {
  async getItem(key: string) {
    await forgetLeftover(key);
    return SecureStore.getItemAsync(key, options);
  },
  async setItem(key: string, value: string) {
    await forgetLeftover(key);
    await SecureStore.setItemAsync(key, value, options);
  },
  async removeItem(key: string) {
    await forgetLeftover(key);
    await SecureStore.deleteItemAsync(key, options);
  },
};
