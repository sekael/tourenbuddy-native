import { useLocalSearchParams } from 'expo-router';

import { ContactFormScreen } from '@/features/contacts/presentation/contact-form-screen';

export default function ContactEditRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ContactFormScreen key={id ?? 'new'} id={id ?? null} />;
}
