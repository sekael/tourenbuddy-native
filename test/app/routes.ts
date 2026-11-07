import TabsLayout from '@/app/(tabs)/_layout';
import CalendarTab from '@/app/(tabs)/calendar';
import MapTab from '@/app/(tabs)/index';
// The whole module, so `renderRouter` also reads its `unstable_settings` (the tabs anchor).
import * as RootLayout from '@/app/_layout';
import ContactsSheet from '@/app/contacts';
import FeedbackSheet from '@/app/feedback';
import InboxSheet from '@/app/inbox';
import ProfileSheet from '@/app/profile';

/** The app's real route tree for `renderRouter` (platform files resolve per test project). */
export const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': MapTab,
  '(tabs)/calendar': CalendarTab,
  inbox: InboxSheet,
  contacts: ContactsSheet,
  profile: ProfileSheet,
  feedback: FeedbackSheet,
};
