import { Redirect } from 'expo-router';

/** The PWA's address for a new friend's overlapping tours: the overlaps sheet on iOS and Android. */
export default function BackfillCollisionsRedirect() {
  return <Redirect href="/tour-overlaps" />;
}
