import { useState } from 'react';

import { Screen } from '@/core/adaptive/screen';
import { TermsPage } from '@/features/terms/presentation/terms-page';
import { useTermsEffective } from '@/features/terms/presentation/stores/terms-store';
import { AboutPage } from '@/features/user/presentation/about-pages';
import {
  signOutEverywhereHere,
  useDeleteAccount,
} from '@/features/user/presentation/profile-pages';

/**
 * The terms gate's route (terms-acceptance), the only one reachable while the signed-in user has not
 * accepted the version in force (`_layout.tsx`). The full texts open over it; back returns to it.
 */
export default function TermsRoute() {
  const [path, setPath] = useState<string[]>([]);
  const { deleting, confirmDeleteAccount } = useDeleteAccount();
  const effective = useTermsEffective();

  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) =>
        value === 'terms' || value === 'privacy' ? (
          <AboutPage name={value} effective={effective} />
        ) : null
      }
    >
      <TermsPage
        onOpen={(page) => setPath([page])}
        onSignOut={() => void signOutEverywhereHere()}
        onDelete={confirmDeleteAccount}
        deleting={deleting}
      />
    </Screen>
  );
}
