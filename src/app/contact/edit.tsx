import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/core/adaptive/screen';
import { ContactFormScreen } from '@/features/contacts/presentation/contact-form-screen';

export default function ContactEditRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <Screen>
      <ContactFormScreen key={id ?? 'new'} id={id ?? null} />
    </Screen>
  );
}
