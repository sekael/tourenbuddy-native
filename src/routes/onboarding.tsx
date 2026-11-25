import { Redirect } from 'expo-router';

/** The PWA's onboarding address: the welcome sheet does it on iOS and Android. */
export default function OnboardingRedirect() {
  return <Redirect href="/" />;
}
