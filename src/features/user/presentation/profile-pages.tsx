import * as Application from 'expo-application';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AsYouType } from 'libphonenumber-js/min';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import {
  ListRow,
  ListSection,
  PickerRow,
  StepperRow,
  TextRow,
  ToggleRow,
} from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { PhoneAlreadyRegisteredError } from '@/core/exceptions';
import { env } from '@/core/env';
import { setAppLanguage } from '@/core/i18n';
import { SUPPORTED_LOCALES } from '@/core/i18n/supported';
import { createLogger } from '@/core/logging/logger';
import { isReachable } from '@/core/offline/online';
import { color } from '@/core/theme/tokens';
import { formatPhoneForDisplay, normalizePhone } from '@/core/utils/phone-normalize';
import { passkeysSupported, useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useInboxAttention } from '@/features/notifications/presentation/inbox-sheet';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';

import { useUserProfileStore } from './stores/user-profile-store';

const log = createLogger('Profile');

/** Signs out after this device's push token is gone, while the session can still delete it. */
export async function signOutEverywhereHere() {
  await useNotificationsStore.getState().removeThisDevice();
  await useAuthStore.getState().signOut();
}

/** The pace's range, a speed factor on every estimated time: tortoise to hare (as in the PWA). */
const PACE_MIN = 0.5;
const PACE_MAX = 1.5;

/** The phone as the profile shows it: the number, or nothing. */
function usePhone() {
  const phone = useAuthStore((s) => s.user?.phone || null);
  const verified = useAuthStore((s) => s.user?.phone_confirmed_at != null);
  return {
    phone: phone ? formatPhoneForDisplay(`+${phone.replace(/^\+/, '')}`) || phone : null,
    verified,
  };
}

/**
 * The Profile tab (user-profile): who the user is (as the PWA's identity card, opening the edit
 * page), the inbox, notifications, calendar sync and language, the pace, password and passkeys, the
 * guided tour and feedback, «Über» (privacy, terms, imprint, inside the app), sign-out and account
 * deletion, as iOS Settings lays such a list out.
 */
export function ProfilePage({ onPush }: { onPush: (page: string) => void }) {
  const { t, i18n } = useTranslation();
  const profile = useUserProfileStore((s) => s.profile);
  const email = useAuthStore((s) => s.user?.email);
  const { phone, verified } = usePhone();
  const attention = useInboxAttention();
  const prefs = useNotificationsStore((s) => s.prefs);
  const pushEnabled = useNotificationsStore((s) => s.pushEnabled);
  const feeds = useCalendarFeedStore((s) => s.feeds);
  const [deleting, setDeleting] = useState(false);

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
  const phoneLine = phone
    ? `${phone} · ${verified ? t('user.profile.verifiedTooltip') : t('user.profile.notVerified')}`
    : t('user.profile.addPhoneBtn');

  function confirmDeleteAccount() {
    if (!isReachable()) {
      Alert.alert(t('user.profile.deleteAccount.offline'));
      return;
    }
    if (!env.EXPO_PUBLIC_NOTIFY_HOOK_URL) {
      Alert.alert(t('user.profile.deleteAccount.unavailable'));
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
          onPress: () => void deleteAccount(),
        },
      ],
    );
  }

  async function deleteAccount() {
    setDeleting(true);
    await useNotificationsStore.getState().removeThisDevice();
    if (!(await useUserProfileStore.getState().deleteAccount())) {
      setDeleting(false);
      Alert.alert(t('user.profile.deleteAccount.failed'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.retry'), onPress: () => void deleteAccount() },
      ]);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await useAuthStore.getState().signOut();
    Alert.alert(t('user.profile.deleteAccount.done'));
  }

  return (
    <Page largeTitle title={t('user.profile.title')}>
      <ListSection>
        <ListRow
          title={name || email || ' '}
          subtitle={[name ? email : null, phoneLine].filter(Boolean).join('\n')}
          avatar={(name || email || '?').charAt(0).toUpperCase()}
          onPress={() => onPush('edit')}
        />
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
        <PickerRow
          title={t('user.profile.languageLabel')}
          icon="language"
          value={i18n.language}
          options={SUPPORTED_LOCALES.map((l) => ({ value: l.code, label: l.label }))}
          onChange={setAppLanguage}
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
        <ListRow
          title={t('user.profile.privacy')}
          icon="privacy_tip"
          onPress={() => onPush('privacy')}
        />
        <ListRow
          title={t('user.profile.terms')}
          icon="description"
          onPress={() => onPush('terms')}
        />
        <ListRow title={t('user.profile.imprint')} icon="info" onPress={() => onPush('imprint')} />
      </ListSection>
      <ListSection>
        <ListRow
          title={t('user.profile.signOutBtn')}
          icon="logout"
          destructive
          disabled={deleting}
          onPress={() => void signOutEverywhereHere()}
        />
        <ListRow
          title={
            deleting
              ? t('user.profile.deleteAccount.deleting')
              : t('user.profile.deleteAccount.entryBtn')
          }
          icon="delete"
          destructive
          disabled={deleting}
          onPress={confirmDeleteAccount}
        />
      </ListSection>
    </Page>
  );
}

/**
 * Who the user is (user-profile): the name their friends see, and their phone (verify it or
 * remove it, or add one), as the PWA's edit form.
 */
export function EditProfilePage({
  onDone,
  onPush,
}: {
  onDone: () => void;
  onPush: (page: string) => void;
}) {
  const { t } = useTranslation();
  const profile = useUserProfileStore((s) => s.profile);
  const { phone, verified } = usePhone();
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
      <ListSection
        title={`${t('user.shared.phoneLabel')} ${t('user.shared.optional')}`}
        footer={t('user.profile.phoneHint')}
      >
        {phone ? (
          <ListRow
            title={phone}
            subtitle={verified ? t('user.profile.verifiedTooltip') : t('user.profile.notVerified')}
            icon={verified ? 'verified' : 'warning'}
            iconColor={verified ? color.primary : color.error}
          />
        ) : null}
        {phone && !verified ? (
          <ListRow
            title={t('user.phoneVerification.verifyBtn')}
            icon="verified"
            onPress={() => onPush('phone')}
          />
        ) : null}
        {phone ? (
          <ListRow
            title={t('user.profile.removePhoneBtn')}
            icon="delete"
            destructive
            onPress={confirmRemovePhone}
          />
        ) : (
          <ListRow
            title={t('user.profile.addPhoneBtn')}
            icon="phone"
            onPress={() => onPush('phone')}
          />
        )}
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
  const [phone, setPhone] = useState(
    current ? formatPhoneForDisplay(`+${current.replace(/^\+/, '')}`) || `+${current}` : '',
  );
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
            // Grouped as it's typed (+41 79 123 45 67), as in the PWA; a deletion stays as typed,
            // or a removed space would come straight back.
            setPhone(text.length < phone.length ? text : new AsYouType('CH').input(text));
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
