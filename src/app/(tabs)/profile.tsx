import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/core/adaptive/screen';
import {
  CalendarFeedHelpPage,
  CalendarSyncPage,
} from '@/features/calendar/presentation/calendar-sync-page';
import { NotificationSettingsPage } from '@/features/notifications/presentation/notification-settings-page';
import { AboutPage } from '@/features/user/presentation/about-pages';
import {
  EditProfilePage,
  PhonePage,
  ProfilePage,
} from '@/features/user/presentation/profile-pages';

const PAGES = ['edit', 'phone', 'notifications', 'sync', 'privacy', 'terms', 'imprint'];

/** The Profile tab: the overview, its settings pushed over it (`?open=` opens one from a link). */
export default function ProfileTab() {
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [path, setPath] = useState<string[]>([]);
  const pop = () => setPath((p) => p.slice(0, -1));
  const push = (page: string) => setPath((p) => [...p, page]);

  // A link's page opens once per link (state adjusted while rendering, not in an effect).
  const [opened, setOpened] = useState<string | undefined>(undefined);
  if (open !== opened) {
    setOpened(open);
    if (open && PAGES.includes(open)) setPath([open]);
  }

  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) => {
        if (value === 'edit') return <EditProfilePage onDone={pop} onPush={push} />;
        if (value === 'phone') return <PhonePage onDone={pop} />;
        if (value === 'notifications') return <NotificationSettingsPage />;
        if (value === 'sync') return <CalendarSyncPage onHelp={() => push('sync-help')} />;
        if (value === 'sync-help') return <CalendarFeedHelpPage />;
        if (value === 'privacy' || value === 'terms' || value === 'imprint')
          return <AboutPage name={value} />;
        return null;
      }}
    >
      <ProfilePage onPush={push} />
    </Screen>
  );
}
