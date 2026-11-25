import '@/core/adaptive/alert';
import '@/core/theme/load-fonts';
import '@/core/offline/session';
// The theme's layers, in order, as JS imports: Metro's dev server drops a CSS `@import`.
import '@/core/web/theme/tokens.css';
import '@/core/web/theme/typography.css';
import '@/core/web/theme/safe-area.css';
import '@/core/web/theme/global.css';

import { Redirect, Slot, useGlobalSearchParams, usePathname, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { sessionTrust } from '@/core/auth/session-trust';
import { useDeviceLocale } from '@/core/i18n';
import { connectivity } from '@/core/offline/online';
import { registerFlushTriggers } from '@/core/offline/triggers';
import { OfflineIndicator } from '@/core/web/offline-indicator.web';
import { OfflineSyncStatus } from '@/core/web/offline-sync-status.web';
import { UpdatePrompt } from '@/core/web/update-prompt.web';
import { registerServiceWorker } from '@/core/web/use-pwa-update.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { forgetSignedOutDevice } from '@/features/notifications/presentation/stores/notifications-store';
import { useSessionStores } from '@/features/shell/presentation/session-stores';
import { webRedirect } from '@/features/shell/presentation/web/web-routes';
import { useTermsGate } from '@/features/terms/presentation/stores/terms-store';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

registerFlushTriggers();
registerServiceWorker();

// No page zoom (global.css → Touch). iOS Safari zooms through its own gesture events; MapLibre
// reads raw touches, so cancelling these leaves the map's pinch-zoom intact.
for (const type of ['gesturestart', 'gesturechange'])
  document.addEventListener(type, (e) => e.preventDefault());

// No install banner, neither the app's nor Chrome's own (owner, 2026-11-23): it covered the guided
// tour. Installing stays in the browser's menu.
window.addEventListener('beforeinstallprompt', (e) => e.preventDefault());

/**
 * The web app's root (port-pwa-web D4): the PWA's shell on the PWA's addresses. The routes follow
 * the session, the terms and the profile in one place, the PWA's router guard as `webRedirect`;
 * nothing renders while one of them is not known yet, so no page flashes before its redirect.
 */
export default function WebRootLayout() {
  useDeviceLocale();
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const gate = useTermsGate(userId);
  const accepted = gate === 'pass';
  useSessionStores(accepted ? userId : null);

  // The profile is known once its first load for this user settled (the stores start above).
  const [settledFor, setSettledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!accepted || !userId) return;
    return useUserProfileStore.subscribe((s, prev) => {
      if (prev.isLoading && !s.isLoading) setSettledFor(userId);
    });
  }, [accepted, userId]);
  const profile = useUserProfileStore((s) => s.profile);
  const profileLoading = useUserProfileStore((s) => s.isLoading);
  const sessionSkipped = useUserProfileStore((s) => s.sessionSkipped);
  const online = useStore(connectivity, (s) => s.online);
  const unverified = useStore(sessionTrust, (s) => s.unverified);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Signed out, at launch or after any sign-out: no push for whoever was here.
  useEffect(() => {
    if (!isLoading && !userId) void forgetSignedOutDevice();
  }, [isLoading, userId]);

  const pathname = usePathname();
  const params = useGlobalSearchParams<{ notification?: string }>();
  const target = isLoading
    ? 'wait'
    : webRedirect(pathname, {
        signedIn: userId !== null,
        gate,
        profile,
        profileKnown: profile !== null || (settledFor === userId && !profileLoading),
        sessionSkipped,
        cannotLoad: !online || unverified,
      });

  if (target === 'wait') return null;
  // A notification link (`/?notification=<id>`) keeps its entry on the way to the map.
  const query =
    target === '/map' && params.notification ? `?notification=${params.notification}` : '';
  // A redirect needs a mounted navigator: without the Slot (a cold start at `/` signed in, an
  // unknown address) Expo Router re-dispatches it forever. The page it leaves stays hidden.
  return (
    <>
      <div style={{ display: target ? 'none' : 'contents' }}>
        <Slot />
      </div>
      {target ? (
        <Redirect href={`${target}${query}` as Href} />
      ) : (
        <>
          <OfflineIndicator />
          <OfflineSyncStatus />
          <UpdatePrompt />
        </>
      )}
    </>
  );
}
