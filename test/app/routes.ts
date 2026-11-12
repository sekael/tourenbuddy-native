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
import ContactRoute from '@/app/contact/[id]';
import ContactEditRoute from '@/app/contact/edit';
import DrawRoute from '@/app/draw';
import FeedbackSheet from '@/app/feedback';
import InboxSheet from '@/app/inbox';
import MapLayersSheet from '@/app/map-layers';
import OfflineMapsSheet from '@/app/offline-maps';
import OfflineRegionSheet from '@/app/offline-region';
import PasskeysSheet from '@/app/passkeys';
import PasswordSheet from '@/app/password';
import LegendRoute from '@/app/legend';
import PlanRoute from '@/app/plan';
import StackRoute from '@/app/stack';
import TourRoute from '@/app/tour/[id]';
import AddSegmentRoute from '@/app/tour/add-segment';
import TourEditRoute from '@/app/tour/edit';
import SuggestionsRoute from '@/app/tour/suggestions';
import TourOverlapsRoute from '@/app/tour-overlaps';
import ToursRoute from '@/app/tours';
import TrailRoute from '@/app/trail';
import SyncIssuesSheet from '@/app/sync-issues';
import WelcomeSheet from '@/app/welcome';

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
  'offline-region': OfflineRegionSheet,
  'map-layers': MapLayersSheet,
  feedback: FeedbackSheet,
  'sync-issues': SyncIssuesSheet,
  welcome: WelcomeSheet,
  password: PasswordSheet,
  passkeys: PasskeysSheet,
  tours: ToursRoute,
  'tour/[id]': TourRoute,
  'tour/edit': TourEditRoute,
  'tour/suggestions': SuggestionsRoute,
  'tour/add-segment': AddSegmentRoute,
  'tour-overlaps': TourOverlapsRoute,
  plan: PlanRoute,
  draw: DrawRoute,
  stack: StackRoute,
  trail: TrailRoute,
  legend: LegendRoute,
  'contact/[id]': ContactRoute,
  'contact/edit': ContactEditRoute,
  'auth/_layout': AuthLayout,
  'auth/index': SignInRoute,
  'auth/sign-up': SignUpRoute,
  'auth/verify-otp': VerifyOtpRoute,
};
