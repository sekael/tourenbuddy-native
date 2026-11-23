import { Workbox } from 'workbox-window';
import { create } from 'zustand';

import { createLogger } from '@/core/logging/logger';
import { isOnline } from '@/core/offline/online';

const log = createLogger('PwaUpdate');

/** Foreground update checks closer together than this are skipped. */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Reloads the page (a seam: tests cannot replace jsdom's `location`). */
export const page = { reload: () => window.location.reload() };

type PwaUpdateState = {
  /** A newer build is installed and waiting; only applying it clears this. */
  updateAvailable: boolean;
  /** The banner was dismissed during this app start. */
  bannerDismissed: boolean;
  apply: () => void;
  dismissBanner: () => void;
};

/**
 * The service worker and its updates (the PWA's `use-pwa-update.ts`, `registerType: 'prompt'`):
 * one registration for the whole app; a new build waits until the user applies it, from the
 * banner, the profile notice or the speed-dial dot. Production builds only: a worker would
 * precache the dev server's bundles.
 */
export const usePwaUpdateStore = create<PwaUpdateState>()((set) => ({
  updateAvailable: false,
  bannerDismissed: false,
  apply: () => page.reload(),
  dismissBanner: () => set({ bannerDismissed: true }),
}));

let started = false;

/** Registers `/sw.js` once (the root layout calls it). */
export function registerServiceWorker() {
  if (started || __DEV__ || !('serviceWorker' in navigator)) return;
  started = true;
  const wb = new Workbox('/sw.js', { scope: '/' });
  let registration: ServiceWorkerRegistration | undefined;
  let lastCheck = Number.NEGATIVE_INFINITY;
  let reloading = false;

  function checkForUpdate() {
    if (!registration || !isOnline() || Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {});
  }
  function reload() {
    if (reloading) return;
    reloading = true;
    page.reload();
  }

  wb.addEventListener('waiting', () => usePwaUpdateStore.setState({ updateAvailable: true }));
  usePwaUpdateStore.setState({
    // The waiting worker already holds the full precache, so this works offline too.
    apply: () => {
      wb.addEventListener('controlling', reload);
      wb.messageSkipWaiting();
    },
  });

  // The first install claims an uncontrolled page (sw `clients.claim`), which also fires
  // controllerchange. That isn't an update: reloading would wipe what the user typed.
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    // Another window applied the update: this one follows while the user sees it.
    if (document.visibilityState === 'visible') reload();
  });
  // Only when the user looks at the app: a hidden PWA's timers are suspended anyway.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });

  wb.register({ immediate: true })
    .then((reg) => {
      registration = reg;
      // Registering doesn't re-fetch sw.js by itself, so check explicitly on app start.
      checkForUpdate();
    })
    .catch((error: unknown) => log.warn('Service worker registration failed', error));
}

export function usePwaUpdate() {
  return {
    updateAvailable: usePwaUpdateStore((s) => s.updateAvailable),
    /** The banner: a pending update not dismissed during this app start. */
    showBanner: usePwaUpdateStore((s) => s.updateAvailable && !s.bannerDismissed),
    applyUpdate: () => usePwaUpdateStore.getState().apply(),
    dismissBanner: () => usePwaUpdateStore.getState().dismissBanner(),
  };
}
