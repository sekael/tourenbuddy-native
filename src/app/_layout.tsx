import { Slot } from 'expo-router';

import { useDeviceLocale } from '@/core/i18n';

export default function RootLayout() {
  useDeviceLocale();
  return <Slot />;
}
