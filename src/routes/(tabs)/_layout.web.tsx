import { Slot } from 'expo-router';

/** The web has no tabs: its pages are the PWA's (port-pwa-web D4), routed by the root layout. */
export default function WebTabsLayout() {
  return <Slot />;
}
