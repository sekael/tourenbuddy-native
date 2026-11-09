/**
 * auth-js storage on web: the browser's, as in the PWA (`expo-secure-store` has no web
 * implementation). Same key as the PWA, so its users stay signed in at the cutover.
 */
export const authStorage = window.localStorage;

/** The browser's storage is always readable. */
export const storageReady = Promise.resolve();
