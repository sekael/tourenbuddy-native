import { UpdateGate } from '@/core/update/update-screen';
import { notificationIdIn, takeLink } from '@/core/links/resolve';
import '@/core/adaptive/alert';
import '@/core/theme/load-fonts';
import '@/core/offline/session';

import * as Notifications from 'expo-notifications';
import {
  router,
  SplashScreen,
  Stack,
  useGlobalSearchParams,
  usePathname,
  type Href,
} from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import {
  formModalOptions,
  mapSheetOptions,
  sheetLayout,
  sheetOptions,
  stepSheetOptions,
} from '@/core/adaptive/sheet';
import { useDeviceLocale } from '@/core/i18n';
import { registerFlushTriggers } from '@/core/offline/triggers';
import { PageBanner } from '@/core/adaptive/page-banner';
import { color } from '@/core/theme/tokens';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useAvailabilityStore } from '@/features/calendar/presentation/stores/availability-store';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { openNotificationLink } from '@/features/notifications/presentation/inbox-navigation';
import { useInboxStore } from '@/features/notifications/presentation/stores/inbox-store';
import {
  OfflineBanner,
  useOfflineStatus,
  watchOfflineFlashes,
} from '@/features/shell/presentation/offline-status';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';
import { useTourDraftStore } from '@/features/tours/presentation/stores/tour-draft-store';
import { useTourFiltersStore } from '@/features/tours/presentation/stores/tour-filters-store';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

registerFlushTriggers();

/**
 * Every signed-in store, started once a user is known and cleared when they sign out or another
 * user signs in, before that user's data loads (D3: the root layout composes the features, as the
 * PWA's `setupAuthRedirect` did).
 */
const sessionStores = [
  useUserProfileStore,
  useContactsStore,
  useFriendshipsStore,
  useUserBlocksStore,
  useToursStore,
  useTourSuggestionsStore,
  useTourLinksStore,
  useAvailabilityStore,
  useNotificationsStore,
  useInboxStore,
];

// A push while the app is open shows as a banner too; the inbox updates on its own.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Opens what a tapped push or a link with `?notification=<id>` is about (notification-inbox),
 * once the user is signed in: the push that launched the app, later taps, and universal links.
 */
let launchHandled = false;

function useNotificationOpens(signedIn: boolean) {
  const { t } = useTranslation();
  const { notification } = useGlobalSearchParams<{ notification?: string }>();
  const pathname = usePathname();

  // A link (the URL now, or held from before sign-in) is followed once the signed-in app shows: a
  // notification opens its entry, any other app path opens unless the app already shows it. A new
  // account's welcome sheet comes first; the link waits for it to close.
  useEffect(() => {
    if (!signedIn || pathname.startsWith('/auth') || pathname === '/welcome') return;
    const held = takeLink();
    const id = notificationIdIn(`?notification=${notification ?? ''}`) ?? notificationIdIn(held);
    if (notification) router.setParams({ notification: undefined });
    if (id) void openNotificationLink(id, t);
    else if (held && held !== '/' && held.split('?')[0] !== pathname) router.navigate(held as Href);
  }, [signedIn, pathname, notification, t]);

  useEffect(() => {
    if (!signedIn || Platform.OS === 'web') return;
    const open = (response: Notifications.NotificationResponse) => {
      const id = notificationIdIn(response.notification.request.content.data?.url);
      if (id) void openNotificationLink(id, t);
    };
    // The push that launched the app opens once, not again after a later sign-in.
    const last = Notifications.getLastNotificationResponse();
    if (last && !launchHandled) open(last);
    launchHandled = true;
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [signedIn, t]);
}

/**
 * A new account names itself and sees what the app does (onboarding-tour): the welcome sheet, once
 * per launch, while the profile asks for it or has no name yet (and the name step was not skipped).
 */
let welcomed = false;

function useWelcome(signedIn: boolean) {
  const profile = useUserProfileStore((s) => s.profile);
  const skipped = useUserProfileStore((s) => s.sessionSkipped);
  const due =
    signedIn &&
    !!profile &&
    (profile.onboardingTourShowAtSignIn || (!profile.firstName?.trim() && !skipped));

  useEffect(() => {
    if (!due || welcomed) return;
    welcomed = true;
    router.push('/welcome');
  }, [due]);
}

function useSessionStores(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    sessionStores.forEach((store) => store.getState().start());
    return () => {
      sessionStores.forEach((store) => store.getState().clear());
      useTourAttachmentsStore.getState().clear();
      useCalendarFeedStore.getState().clear();
      useTourDraftStore.getState().reset();
      useTourFiltersStore.getState().reset();
    };
  }, [userId]);
}

// A deep link straight to a sheet still has the tabs beneath it to return to.
export const unstable_settings = { anchor: '(tabs)' };

// The launch screen stays until the session is known, so neither sign-in nor the map flashes.
void SplashScreen.preventAutoHideAsync();

/**
 * The routes follow the session, both ways, in one place: signed out, only sign-in is reachable;
 * signed in, the tabs and the sheets above them. When the session changes, Expo Router leaves the
 * screens that became unreachable, with their history. While the session is restored, under the
 * launch screen, the signed-in side stays open too (sign-in is, since nobody is signed in yet), so
 * the address the app was opened at is kept for a signed-in user instead of bouncing through
 * sign-in to the map.
 */
export default function RootLayout() {
  useDeviceLocale();
  const initialize = useAuthStore((state) => state.initialize);
  const isLoading = useAuthStore((state) => state.isLoading);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const signedIn = userId !== null;
  useSessionStores(userId);
  useNotificationOpens(signedIn);
  useWelcome(signedIn);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isLoading) SplashScreen.hide();
  }, [isLoading]);

  useEffect(() => (signedIn ? watchOfflineFlashes() : undefined), [signedIn]);
  const status = useOfflineStatus();
  const banner = signedIn && status ? <OfflineBanner status={status} /> : null;

  return (
    <PageBanner.Provider value={banner}>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.background } }}
        screenLayout={sheetLayout}
      >
        <Stack.Protected guard={isLoading || signedIn} redirectTo="/auth">
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="tours" options={mapSheetOptions} />
          <Stack.Screen name="tour/[id]" options={mapSheetOptions} />
          <Stack.Screen name="tour/edit" options={formModalOptions} />
          <Stack.Screen name="tour/suggestions" options={mapSheetOptions} />
          <Stack.Screen name="tour/add-segment" options={mapSheetOptions} />
          <Stack.Screen name="tour-overlaps" options={mapSheetOptions} />
          <Stack.Screen name="plan" options={stepSheetOptions} />
          <Stack.Screen name="draw" options={stepSheetOptions} />
          <Stack.Screen name="stack" options={mapSheetOptions} dangerouslySingular />
          <Stack.Screen name="trail" options={mapSheetOptions} dangerouslySingular />
          <Stack.Screen name="legend" options={mapSheetOptions} />
          <Stack.Screen name="contact/[id]" options={mapSheetOptions} />
          <Stack.Screen name="contact/edit" options={formModalOptions} />
          <Stack.Screen name="inbox" options={mapSheetOptions} />
          <Stack.Screen name="offline-maps" options={mapSheetOptions} />
          <Stack.Screen name="offline-region" options={stepSheetOptions} />
          <Stack.Screen name="map-layers" options={mapSheetOptions} />
          <Stack.Screen name="search" options={mapSheetOptions} />
          <Stack.Screen name="feedback" options={mapSheetOptions} />
          <Stack.Screen name="sync-issues" options={mapSheetOptions} />
          <Stack.Screen name="welcome" options={formModalOptions} />
          <Stack.Screen name="password" options={sheetOptions} />
          <Stack.Screen name="passkeys" options={sheetOptions} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn} redirectTo="/">
          <Stack.Screen name="auth" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
      <UpdateGate />
    </PageBanner.Provider>
  );
}
