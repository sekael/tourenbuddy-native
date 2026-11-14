import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { IconName } from '@/core/adaptive/icons';
import { ListRow, ListSection, TextRow } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

/**
 * Welcome (onboarding-tour, D12 as revised): the name step a new account needs, then what the app
 * does, the PWA's guided-tour steps as an index in their order. A row closes the sheet and opens its
 * place. Done stops it showing at sign-in; swiping it away only skips it for this launch. Reopened
 * from Profile ("Show app tour"), it starts at the index.
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

function open(feature: Feature) {
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
  const needsName = start !== 'features' && !!profile && !profile.firstName?.trim();
  const [path, setPath] = useState<string[]>([]);

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
        fromSignIn && !needsName
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
            onPress={() => open(feature)}
          />
        ))}
      </ListSection>
    </Page>
  );

  if (!needsName) return <Screen>{features}</Screen>;
  return (
    <Screen path={path} onPathChange={setPath} renderPage={() => features}>
      <NamePage onDone={() => setPath(['features'])} />
    </Screen>
  );
}

/** A new account's name (user-profile "Profile setup"): both names, or skip for this launch. */
function NamePage({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [tried, setTried] = useState(false);
  const missingFirst = !first.trim();
  const missingLast = !last.trim();

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
