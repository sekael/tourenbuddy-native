import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/core/adaptive/screen';
import { ContactFormScreen } from '@/features/contacts/presentation/contact-form-screen';

/** `first`, `last`, `phones` (one per line) prefill a new contact: an import's skipped card. */
export default function ContactEditRoute() {
  const { id, first, last, phones } = useLocalSearchParams<{
    id?: string;
    first?: string;
    last?: string;
    phones?: string;
  }>();
  const draft =
    !id && (first || phones)
      ? { first: first ?? '', last: last ?? '', phones: phones ? phones.split('\n') : [] }
      : undefined;
  return (
    <Screen>
      <ContactFormScreen key={id ?? 'new'} id={id ?? null} draft={draft} />
    </Screen>
  );
}
