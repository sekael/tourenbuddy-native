import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/core/adaptive/screen';
import {
  CalendarFeedHelpPage,
  CalendarSyncPage,
} from '@/features/calendar/presentation/calendar-sync-page';
import { NotificationSettingsPage } from '@/features/notifications/presentation/notification-settings-page';
import {
  EditProfilePage,
  PhonePage,
  ProfilePage,
} from '@/features/user/presentation/profile-pages';

const PAGES = ['edit', 'phone', 'notifications', 'sync'];

/** The Profile tab: the overview, its settings pushed over it (`?open=` opens one from a link). */
export default function ProfileTab() {
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [path, setPath] = useState<string[]>([]);
  const pop = () => setPath((p) => p.slice(0, -1));

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
        if (value === 'edit') return <EditProfilePage onDone={pop} />;
        if (value === 'phone') return <PhonePage onDone={pop} />;
        if (value === 'notifications') return <NotificationSettingsPage />;
        if (value === 'sync')
          return <CalendarSyncPage onHelp={() => setPath((p) => [...p, 'sync-help'])} />;
        if (value === 'sync-help') return <CalendarFeedHelpPage />;
        return null;
      }}
    >
      <ProfilePage onPush={(page) => setPath((p) => [...p, page])} />
    </Screen>
  );
}
