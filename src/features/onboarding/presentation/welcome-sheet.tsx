import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard } from 'react-native';

import type { IconName } from '@/core/adaptive/icons';
import { ListRow, ListSection, TextRow } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { startTourFeature, useTourReturn } from './tour-return';

/**
 * Welcome (onboarding-tour, D12 as revised): the name step a new account needs, then what the app
 * does, the PWA's guided-tour steps as an index in their order. A row closes the sheet and opens its
 * place, and the tab bar's accessory leads back here. Done stops it showing at sign-in; swiping it
 * away only skips it for this launch. Reopened from Profile ("Show app tour"), it starts at the index;
 * back from a feature (`resume`), at the index with the controls it had.
 */
type Feature = {
  key:
    | 'addLocation'
    | 'mapLayers'
    | 'offlineMap'
    | 'tours'
    | 'addContact'
    | 'friendRequests'
    | 'inbox'
    | 'phone'
    | 'notifications'
    | 'calendarSync'
    | 'openCalendar';
  icon: IconName;
  /** A tab, or a sheet over the map (`overMap`). */
  href: Href;
  overMap?: boolean;
};

const FEATURES: Feature[] = [
  { key: 'addLocation', icon: 'add_location_alt', href: '/plan', overMap: true },
  { key: 'mapLayers', icon: 'layers', href: '/map-layers', overMap: true },
  { key: 'offlineMap', icon: 'download_for_offline', href: '/offline-maps', overMap: true },
  { key: 'tours', icon: 'location_on', href: '/tours', overMap: true },
  { key: 'addContact', icon: 'contacts', href: '/contacts' },
  { key: 'friendRequests', icon: 'person_add', href: '/contacts?open=requests' },
  { key: 'inbox', icon: 'inbox', href: '/inbox', overMap: true },
  { key: 'phone', icon: 'phone', href: '/profile?open=phone' },
  { key: 'notifications', icon: 'notifications', href: '/profile?open=notifications' },
  { key: 'calendarSync', icon: 'sync_alt', href: '/profile?open=sync' },
  { key: 'openCalendar', icon: 'calendar_today', href: '/calendar' },
];

function open(feature: Feature, start: 'resume' | 'features') {
  startTourFeature(start, String(feature.href));
  router.back();
  if (feature.overMap) {
    router.navigate('/');
    router.push(feature.href);
  } else {
    router.navigate(feature.href);
  }
}

export function WelcomeSheet() {
  const { t } = useTranslation();
  const { start } = useLocalSearchParams<{ start?: string }>();
  const profile = useUserProfileStore((s) => s.profile);
  // The name step, decided once as the sheet opens: saving the name must not swap the sheet for
  // another tree (a flash), and the overview after it is the sheet's first page, with no back
  // button to a name already saved.
  // Undecided until the profile is known (it can arrive after the sheet opens).
  const known = start
    ? 'features'
    : profile
      ? profile.firstName?.trim()
        ? 'features'
        : 'name'
      : null;
  const [step, setStep] = useState<'name' | 'features' | null>(known);
  if (step === null && known !== null) setStep(known);
  // Open, it is its own way back; closed without picking a place, the tour is over.
  useLayoutEffect(() => useTourReturn.setState({ start: null }), []);

  const done = () => {
    void useUserProfileStore.getState().dismissTourAtSignIn();
    router.back();
  };

  // At sign-in: skip for now, or Done for good. Reopened from Profile: just close.
  const fromSignIn = start !== 'features';
  const features = (
    <Page
      largeTitle
      title={t('onboarding.tour.welcome.title')}
      onClose={fromSignIn ? undefined : () => router.back()}
      cancel={
        fromSignIn
          ? { label: t('onboarding.tour.welcome.skip'), onPress: () => router.back() }
          : undefined
      }
      confirm={
        fromSignIn ? { label: t('onboarding.tour.controls.done'), onPress: done } : undefined
      }
    >
      <ListSection title={t('onboarding.index.intro')}>
        {FEATURES.map((feature) => (
          <ListRow
            key={feature.key}
            title={
              feature.key === 'openCalendar'
                ? t('shell.tabs.calendar')
                : t(`onboarding.tour.labels.${feature.key}`)
            }
            subtitle={t(`onboarding.index.${feature.key}`)}
            icon={feature.icon}
            onPress={() => open(feature, fromSignIn ? 'resume' : 'features')}
          />
        ))}
      </ListSection>
    </Page>
  );

  // As tall as its page: the name step is two fields, not a screen of empty space; the overview
  // grows the sheet up to the screen.
  return (
    <Screen fit>
      {step === 'name' ? <NamePage onDone={() => setStep('features')} /> : features}
    </Screen>
  );
}

/** A new account's name (user-profile "Profile setup"): both names, or skip for this launch. */
function NamePage({ onDone: next }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [tried, setTried] = useState(false);
  const missingFirst = !first.trim();
  const missingLast = !last.trim();

  // The keyboard goes before the tour takes the sheet: it doesn't linger over the new page.
  const onDone = () => {
    Keyboard.dismiss();
    next();
  };
  const save = () => {
    setTried(true);
    if (missingFirst || missingLast) return;
    void useUserProfileStore
      .getState()
      .updateProfile({ firstName: first.trim(), lastName: last.trim() });
    onDone();
  };
  const skip = () => {
    useUserProfileStore.getState().skipOnboarding();
    onDone();
  };

  return (
    <Page
      form
      title={t('user.onboarding.title')}
      cancel={{ label: t('user.onboarding.skipBtn'), onPress: skip }}
      confirm={{ label: t('user.onboarding.continueBtn'), onPress: save }}
    >
      <ListSection
        footer={
          tried && missingFirst
            ? t('user.onboarding.firstNameRequired')
            : tried && missingLast
              ? t('user.onboarding.lastNameRequired')
              : t('user.onboarding.subtitle')
        }
      >
        <TextRow
          label={t('user.shared.firstNameLabel')}
          value={first}
          onChangeText={setFirst}
          autoCapitalize="words"
          textContentType="givenName"
        />
        <TextRow
          label={t('user.shared.lastNameLabel')}
          value={last}
          onChangeText={setLast}
          autoCapitalize="words"
          textContentType="familyName"
        />
      </ListSection>
    </Page>
  );
}
