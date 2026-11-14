import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/core/adaptive/screen';
import { ContactDetailPage } from '@/features/contacts/presentation/contact-detail-page';

/** A contact as its own sheet: a tour's partner, a contact just added. */
export default function ContactRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <ContactDetailPage id={id} onClose={() => router.back()} onGone={() => router.back()} />
    </Screen>
  );
}
