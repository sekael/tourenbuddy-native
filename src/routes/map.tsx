import { Redirect } from 'expo-router';

/** The PWA's map address: the Map tab on iOS and Android (the web has its own `map.web.tsx`). */
export default function MapRedirect() {
  return <Redirect href="/" />;
}
