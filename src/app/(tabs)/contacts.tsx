import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Screen } from '@/core/adaptive/screen';
import { ContactDetailPage } from '@/features/contacts/presentation/contact-detail-page';
import type { ImportResult } from '@/features/contacts/presentation/contact-import';
import {
  ContactsListPage,
  ImportResultsPage,
} from '@/features/contacts/presentation/contacts-list-page';
import { FriendRequestsPage } from '@/features/friendships/presentation/friend-requests-page';

/** The Contacts tab: the list, a contact, friend requests and an import's outcome pushed over it. */
export default function ContactsTab() {
  const [path, setPath] = useState<string[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const push = (value: string) => setPath((p) => [...p, value]);
  const pop = () => setPath((p) => p.slice(0, -1));
  // A friend request's notification opens the requests.
  const { open } = useLocalSearchParams<{ open?: string }>();
  const [opened, setOpened] = useState<string | undefined>(undefined);
  if (open !== opened) {
    setOpened(open);
    if (open === 'requests') setPath(['requests']);
  }

  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) => {
        if (value === 'requests') return <FriendRequestsPage />;
        if (value === 'import') return <ImportResultsPage results={results} />;
        if (value.startsWith('contact:'))
          return <ContactDetailPage id={value.slice(8)} onGone={pop} />;
        return null;
      }}
    >
      <ContactsListPage
        onOpen={(id) => push(`contact:${id}`)}
        onRequests={() => push('requests')}
        onImported={(next) => {
          setResults(next);
          push('import');
        }}
      />
    </Screen>
  );
}
