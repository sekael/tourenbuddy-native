import TabsLayout from '@/app/(tabs)/_layout';
import CalendarTab from '@/app/(tabs)/calendar';
import ContactsTab from '@/app/(tabs)/contacts';
import MapTab from '@/app/(tabs)/index';
import ProfileTab from '@/app/(tabs)/profile';
// The whole module, so `renderRouter` also reads its `unstable_settings` (the tabs anchor).
import * as RootLayout from '@/app/_layout';
import AuthLayout from '@/app/auth/_layout';
import SignInRoute from '@/app/auth/index';
import SignUpRoute from '@/app/auth/sign-up';
import VerifyOtpRoute from '@/app/auth/verify-otp';
import FeedbackSheet from '@/app/feedback';
import InboxSheet from '@/app/inbox';
import MapLayersSheet from '@/app/map-layers';
import OfflineMapsSheet from '@/app/offline-maps';
import PasskeysSheet from '@/app/passkeys';
import PasswordSheet from '@/app/password';

/** The app's real route tree for `renderRouter` (platform files resolve per test project). */
export const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': MapTab,
  '(tabs)/calendar': CalendarTab,
  '(tabs)/contacts': ContactsTab,
  '(tabs)/profile': ProfileTab,
  inbox: InboxSheet,
  'offline-maps': OfflineMapsSheet,
  'map-layers': MapLayersSheet,
  feedback: FeedbackSheet,
  password: PasswordSheet,
  passkeys: PasskeysSheet,
  'auth/_layout': AuthLayout,
  'auth/index': SignInRoute,
  'auth/sign-up': SignUpRoute,
  'auth/verify-otp': VerifyOtpRoute,
};
