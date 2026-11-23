const isIos = () => /ipad|iphone|ipod/i.test(navigator.userAgent);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true);

/**
 * Push capability (the PWA's `useNotificationCapability`):
 * - `pushSupported`: the browser supports Web Push and permission can be requested
 * - `requiresPwaInstall`: iOS Safari outside an installed (standalone) web app
 */
export function useNotificationCapability() {
  const requiresPwaInstall = isIos() && !isStandalone();
  const pushSupported =
    'PushManager' in window && 'serviceWorker' in navigator && !requiresPwaInstall;
  return { pushSupported, requiresPwaInstall };
}
