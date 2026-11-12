import * as Application from 'expo-application';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { ListRow, ListSection, StepperRow, TextRow, ToggleRow } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { PhoneAlreadyRegisteredError } from '@/core/exceptions';
import { createLogger } from '@/core/logging/logger';
import { isReachable } from '@/core/offline/online';
import { color, space } from '@/core/theme/tokens';
import { formatPhoneForDisplay, normalizePhone } from '@/core/utils/phone-normalize';
import { passkeysSupported, useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useInboxAttention } from '@/features/notifications/presentation/inbox-sheet';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';

import { useUserProfileStore } from './stores/user-profile-store';

const log = createLogger('Profile');
const SITE = 'https://tourenbuddy.ch';

/** Signs out after this device's push token is gone, while the session can still delete it. */
export async function signOutEverywhereHere() {
  await useNotificationsStore.getState().removeThisDevice();
  await useAuthStore.getState().signOut();
}

/**
 * The Profile tab (user-profile): who the user is and their phone (verified or not), the inbox,
 * notifications and calendar sync, password and passkeys, feedback, the legal pages, sign-out
 * and account deletion, as iOS Settings lays such a list out.
 */
/** The pace's range, a speed factor on every estimated time: tortoise to hare (as in the PWA). */
const PACE_MIN = 0.5;
const PACE_MAX = 1.5;

export function ProfilePage({ onPush }: { onPush: (page: string) => void }) {
  const { t, i18n } = useTranslation();
  const profile = useUserProfileStore((s) => s.profile);
  const email = useAuthStore((s) => s.user?.email);
  const phone = useAuthStore((s) => s.user?.phone || null);
  const verified = useAuthStore((s) => s.user?.phone_confirmed_at != null);
  const attention = useInboxAttention();
  const prefs = useNotificationsStore((s) => s.prefs);
  const pushEnabled = useNotificationsStore((s) => s.pushEnabled);
  const feeds = useCalendarFeedStore((s) => s.feeds);
  const de = i18n.language.startsWith('de');

  useEffect(() => {
    void useCalendarFeedStore.getState().loadFeeds();
  }, []);

  const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ');
  const notificationSummary =
    pushEnabled && prefs?.notifEmailEnabled
      ? 'pushAndEmail'
      : pushEnabled
        ? 'push'
        : prefs?.notifEmailEnabled
          ? 'email'
          : 'off';
  const feedProblem = feeds.some((f) => f.lastError);
  const legal = (path: string) => () => void Linking.openURL(`${SITE}${de ? '/de' : ''}/${path}`);

  function confirmRemovePhone() {
    const { hasFriendship, hasPending } = useFriendshipsStore
      .getState()
      .currentUserHasAnyRelationship();
    const warning =
      hasFriendship && hasPending
        ? t('user.profile.removePhoneBothWarning')
        : hasFriendship
          ? t('user.profile.removePhoneFriendshipWarning')
          : hasPending
            ? t('user.profile.removePhonePendingWarning')
            : null;
    Alert.alert(
      t('user.profile.removePhoneConfirmTitle'),
      [t('user.profile.removePhoneDisclaimer'), warning].filter(Boolean).join('\n\n'),
      [
        { text: t('user.profile.removePhoneCancelBtn'), style: 'cancel' },
        {
          text: t('user.profile.removePhoneConfirmBtn'),
          style: 'destructive',
          onPress: () =>
            void useUserProfileStore
              .getState()
              .deletePhone()
              .catch(() => Alert.alert(t('user.profile.removePhoneFailed'))),
        },
      ],
    );
  }

  function confirmDeleteAccount() {
    if (!isReachable()) {
      Alert.alert(t('user.profile.deleteAccount.offline'));
      return;
    }
    Alert.alert(
      t('user.profile.deleteAccount.title'),
      `${t('user.profile.deleteAccount.body')}\n\n${t('user.profile.deleteAccount.hint')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('user.profile.deleteAccount.confirmBtn'),
          style: 'destructive',
          onPress: () =>
            void (async () => {
              await useNotificationsStore.getState().removeThisDevice();
              if (await useUserProfileStore.getState().deleteAccount()) {
                await useAuthStore.getState().signOut();
              } else {
                Alert.alert(t('user.profile.deleteAccount.failed'));
              }
            })(),
        },
      ],
    );
  }

  const hero = (
    <View style={styles.hero}>
      <Text variant="title" role="heading">
        {name || email || ' '}
      </Text>
      {name && email ? <Text style={styles.muted}>{email}</Text> : null}
    </View>
  );

  return (
    <Page largeTitle title={t('user.profile.title')} header={hero}>
      <ListSection>
        <ListRow title={t('user.profile.editBtn')} icon="person" onPress={() => onPush('edit')} />
        {phone ? (
          <ListRow
            title={formatPhoneForDisplay(`+${phone.replace(/^\+/, '')}`) || phone}
            subtitle={verified ? t('user.profile.verifiedTooltip') : t('user.profile.notVerified')}
            icon={verified ? 'verified' : 'warning'}
            iconColor={verified ? color.primary : color.error}
            menu={[
              ...(verified
                ? []
                : [
                    {
                      label: t('user.phoneVerification.verifyBtn'),
                      icon: 'verified' as const,
                      onPress: () => onPush('phone'),
                    },
                  ]),
              {
                label: t('user.profile.removePhoneBtn'),
                icon: 'delete' as const,
                destructive: true,
                onPress: confirmRemovePhone,
              },
            ]}
          />
        ) : (
          <ListRow
            title={t('user.profile.addPhoneBtn')}
            icon="phone"
            onPress={() => onPush('phone')}
          />
        )}
      </ListSection>
      <ListSection>
        <ListRow
          title={t('inbox.title')}
          icon="inbox"
          badge={attention > 9 ? '9+' : attention || undefined}
          onPress={() => router.push('/inbox')}
        />
        <ListRow
          title={t('notifications.sectionTitle')}
          icon="notifications"
          value={t(`user.profile.notificationsSummary.${notificationSummary}`)}
          onPress={() => onPush('notifications')}
        />
        <ListRow
          title={t('calendar.sync.title')}
          icon="sync_alt"
          value={
            feedProblem
              ? t('user.profile.calendarProblem')
              : t('user.profile.calendarSummary', { count: feeds.length })
          }
          onPress={() => onPush('sync')}
        />
        <ListRow
          title={t('user.profile.languageLabel')}
          icon="language"
          value={de ? 'Deutsch' : 'English'}
          onPress={() => void Linking.openSettings()}
        />
      </ListSection>
      <ListSection footer={t('user.profile.paceHint')}>
        <StepperRow
          title={t('tours.route.pace')}
          value={profile?.pace ?? 1}
          min={PACE_MIN}
          max={PACE_MAX}
          step={0.1}
          onChange={(pace) =>
            void useUserProfileStore.getState().updateProfile({ pace: Math.round(pace * 10) / 10 })
          }
          format={(pace) => `${pace.toFixed(1)}×`}
        />
      </ListSection>
      <ListSection title={t('user.profile.accountSection')}>
        <ListRow
          title={t('auth.password.entryBtn')}
          icon="lock"
          onPress={() => router.push('/password')}
        />
        {passkeysSupported ? (
          <ListRow
            title={t('auth.passkey.entryBtn')}
            icon="badge"
            onPress={() => router.push('/passkeys')}
          />
        ) : null}
        <ListRow
          title={t('onboarding.tour.controls.reopen')}
          icon="help"
          onPress={() => router.push({ pathname: '/welcome', params: { start: 'features' } })}
        />
        <ListRow
          title={t('map.overlay.feedback')}
          icon="feedback"
          onPress={() => router.push('/feedback')}
        />
      </ListSection>
      <ListSection
        title={t('user.profile.legalSection')}
        footer={t('user.profile.version', {
          version: Application.nativeApplicationVersion ?? '–',
        })}
      >
        <ListRow title={t('user.profile.privacy')} icon="privacy_tip" onPress={legal('privacy')} />
        <ListRow title={t('user.profile.terms')} icon="description" onPress={legal('terms')} />
        <ListRow title={t('user.profile.imprint')} icon="info" onPress={legal('imprint')} />
      </ListSection>
      <ListSection>
        <ListRow
          title={t('user.profile.signOutBtn')}
          icon="logout"
          destructive
          onPress={() => void signOutEverywhereHere()}
        />
        <ListRow
          title={t('user.profile.deleteAccount.entryBtn')}
          icon="delete"
          destructive
          onPress={confirmDeleteAccount}
        />
      </ListSection>
    </Page>
  );
}

/** Edit the name the user's friends see (user-profile). */
export function EditProfilePage({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const profile = useUserProfileStore((s) => s.profile);
  const [first, setFirst] = useState(profile?.firstName ?? '');
  const [last, setLast] = useState(profile?.lastName ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!first.trim() || !last.trim()) {
      Alert.alert(t('user.profile.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await useUserProfileStore
        .getState()
        .updateProfile({ firstName: first.trim(), lastName: last.trim() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone();
    } catch (error) {
      log.error('Save profile failed', error);
      Alert.alert(t('user.profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      form
      title={t('user.profile.editBtn')}
      confirm={{ label: t('user.shared.saveBtn'), onPress: () => void save(), disabled: saving }}
    >
      <ListSection>
        <TextRow
          label={t('user.shared.firstNameLabel')}
          placeholder={t('user.shared.firstNamePlaceholder')}
          value={first}
          onChangeText={setFirst}
          autoCapitalize="words"
          textContentType="givenName"
        />
        <TextRow
          label={t('user.shared.lastNameLabel')}
          placeholder={t('user.shared.lastNamePlaceholder')}
          value={last}
          onChangeText={setLast}
          autoCapitalize="words"
          textContentType="familyName"
        />
      </ListSection>
    </Page>
  );
}

const RESEND_SECONDS = 60;

/**
 * Add and verify a phone number (phone-verification): the discoverability notice to accept, the
 * number, then the six-digit code from the SMS, with a resend after a minute.
 */
export function PhonePage({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const current = useAuthStore((s) => s.user?.phone || '');
  const [phone, setPhone] = useState(current ? `+${current.replace(/^\+/, '')}` : '');
  const [understood, setUnderstood] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function send(number: string) {
    const normalized = normalizePhone(number);
    if (!normalized.ok) {
      setError(t('user.phoneVerification.invalidPhone'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const store = useUserProfileStore.getState();
      await store.checkPhoneAvailability(normalized.e164);
      await store.sendPhoneVerification(normalized.e164);
      setSentTo(normalized.e164);
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(
        err instanceof PhoneAlreadyRegisteredError
          ? t('user.phoneVerification.alreadyRegisteredError')
          : t('user.phoneVerification.sendFailed'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sentTo) return;
    if (!/^\d{6}$/.test(code)) {
      setError(t('user.phoneVerification.incompleteCode'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await useUserProfileStore.getState().verifyPhone(sentTo, code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(t('user.phoneVerification.verifiedMsg'));
      void useFriendshipsStore.getState().fetchAll();
      onDone();
    } catch {
      setError(t('user.phoneVerification.invalidCode'));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <Page
        form
        title={t('user.phoneVerification.title')}
        confirm={{
          label: t('user.phoneVerification.verifyBtn'),
          onPress: () => void verify(),
          disabled: busy || code.length !== 6,
        }}
      >
        <ListSection
          footer={`${t('user.phoneVerification.subtitlePrefix')} ${formatPhoneForDisplay(sentTo) || sentTo}`}
        >
          <TextRow
            label={t('user.phoneVerification.codeLabel')}
            placeholder={t('user.phoneVerification.codePlaceholder')}
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
            keyboardType="numeric"
            textContentType="oneTimeCode"
            maxLength={6}
            error={error ?? undefined}
            onSubmit={() => void verify()}
          />
        </ListSection>
        <ListSection>
          <ListRow
            title={
              wait > 0
                ? `${t('user.phoneVerification.resendCountdown')} ${wait} s`
                : t('user.phoneVerification.resendBtn')
            }
            icon="replay"
            chevron={false}
            disabled={wait > 0 || busy}
            onPress={() => void send(sentTo)}
          />
        </ListSection>
      </Page>
    );
  }

  return (
    <Page
      form
      title={t('user.shared.phoneLabel')}
      confirm={{
        label: t('user.phoneVerification.sendCodeBtn'),
        onPress: () => void send(phone),
        disabled: busy || !understood || !phone.trim(),
      }}
    >
      <ListSection>
        <TextRow
          label={t('user.shared.phoneLabel')}
          placeholder={t('user.shared.phonePlaceholder')}
          value={phone}
          onChangeText={(text) => {
            setPhone(text);
            setError(null);
          }}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          error={error ?? undefined}
        />
      </ListSection>
      <ListSection
        title={t('friendships.verificationNotice.title')}
        footer={t('friendships.verificationNotice.body')}
      >
        <ToggleRow
          title={t('friendships.verificationNotice.acknowledge')}
          value={understood}
          onValueChange={setUnderstood}
        />
      </ListSection>
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xxs, paddingVertical: space.xs },
  muted: { color: color.onSurfaceVariant },
});
