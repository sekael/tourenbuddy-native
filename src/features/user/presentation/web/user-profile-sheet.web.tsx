import { useRouter } from 'expo-router';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { InvalidPhoneNumberError, PhoneAlreadyRegisteredError } from '@/core/exceptions';
import { connectivity } from '@/core/offline/online';
import { offlineSignals } from '@/core/offline/signals';
import { AdaptiveOverlay } from '@/core/web/adaptive-overlay.web';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { Transition } from '@/core/web/transition.web';
import { useAsYouTypePhone } from '@/core/web/use-as-you-type-phone.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { CalendarSyncSettings } from '@/features/calendar/presentation/web/calendar-sync-settings.web';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { PhoneVerificationNotice } from '@/features/friendships/presentation/web/phone-verification-notice.web';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';
import { NotificationPreferencesSection } from '@/features/notifications/presentation/web/notification-preferences-section.web';
import { useOnboardingTourStore } from '@/features/onboarding/presentation/web/onboarding-tour-store.web';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { DeleteAccountDialog } from './delete-account-dialog.web';
import { PhoneVerificationDialog } from './phone-verification-dialog.web';
import { ProfileOverview, type ProfileSection } from './profile-overview.web';
import { useFullProfile } from './use-full-profile.web';
import styles from './user-profile-sheet.module.css';

const c = classes(styles);

/**
 * The profile (`user-profile-sheet.vue`): the overview at a glance, each section its own view (a
 * full-screen page on phones). A deep link may open straight into a section.
 */
export function UserProfileSheet({
  initialSection,
  onClose,
}: {
  initialSection?: ProfileSection;
  onClose: () => void;
}) {
  const { t } = useTranslation('web');
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const online = useStore(connectivity, (s) => s.online);
  const full = useFullProfile();
  const [view, setView] = useState<'overview' | ProfileSection>(initialSection ?? 'overview');
  const isEditing = view === 'edit';
  // On phones every section takes a full-screen page; editing also moves Save to the top bar.
  const editAsPage = !isDesktop && isEditing;
  const title = {
    overview: t('user.profile.title'),
    edit: t('user.profile.editBtn'),
    notifications: t('notifications.sectionTitle'),
    calendar: t('calendar.sync.title'),
  }[view];

  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const phoneInput = useAsYouTypePhone(editPhone, setEditPhone);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [showVerificationNotice, setShowVerificationNotice] = useState(false);
  const [showRemovePhoneConfirm, setShowRemovePhoneConfirm] = useState(false);
  const [isRemovingPhone, setIsRemovingPhone] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingPhoneForNotice, setPendingPhoneForNotice] = useState('');
  const [removePhoneRelationships, setRemovePhoneRelationships] = useState<{
    hasPending: boolean;
    hasFriendship: boolean;
  } | null>(null);
  const profileStore = () => useUserProfileStore.getState();

  function startEdit() {
    setEditFirstName(full?.firstName ?? '');
    setEditLastName(full?.lastName ?? '');
    setEditPhone(full?.phoneNumber ?? '');
    setEditError(null);
    setView('edit');
  }
  const openSection = (section: ProfileSection) =>
    section === 'edit' ? startEdit() : setView(section);
  function cancelEdit() {
    setView('overview');
    setEditError(null);
  }
  const goBack = () => (isEditing ? cancelEdit() : setView('overview'));

  const errorMessage = (err: unknown) =>
    err instanceof PhoneAlreadyRegisteredError
      ? t('user.phoneVerification.alreadyRegisteredError')
      : err instanceof InvalidPhoneNumberError || err instanceof Error
        ? (err as Error).message
        : t('user.profile.saveFailed');

  async function handleSave(event?: FormEvent) {
    event?.preventDefault();
    setEditError(null);
    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditError(t('user.profile.nameRequired'));
      return;
    }
    setIsSaving(true);
    try {
      await profileStore().updateProfile({
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
      });
      const phone = editPhone.trim();
      const phoneChanged = phone !== (full?.phoneNumber ?? '');
      // The name queued offline; the phone half needs the network (availability + OTP), so offline
      // it raises the shared "unavailable offline" snackbar and closes the edit.
      if (phoneChanged && phone && !connectivity.getState().online) {
        offlineSignals.setState({ offlineBlockedAt: Date.now() });
        setView('overview');
      } else if (phoneChanged && phone) {
        // Pre-check: no discoverability notice for a number that will be rejected.
        await profileStore().checkPhoneAvailability(phone);
        setPendingPhoneForNotice(phone);
        setView('overview');
        setShowVerificationNotice(true);
      } else setView('overview');
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  }

  // Reopen the onboarding tour: close this sheet so the tour can stage its own overlays.
  function handleShowTour() {
    onClose();
    useOnboardingTourStore.getState().requestReopen();
  }

  async function handleNoticeAcknowledged() {
    setShowVerificationNotice(false);
    setIsSaving(true);
    try {
      await profileStore().sendPhoneVerification(pendingPhoneForNotice);
      setPendingPhone(pendingPhoneForNotice);
      setShowPhoneVerification(true);
    } catch (err) {
      setEditError(errorMessage(err));
      setView('edit');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemovePhone() {
    if (full?.phoneVerified) {
      setRemovePhoneRelationships(useFriendshipsStore.getState().currentUserHasAnyRelationship());
      setShowRemovePhoneConfirm(true);
    } else await executeDeletePhone();
  }

  async function executeDeletePhone() {
    setIsRemovingPhone(true);
    await profileStore().deletePhone();
    setIsRemovingPhone(false);
    if (!profileStore().error) {
      setShowRemovePhoneConfirm(false);
      setView('overview');
    } else setEditError(t('user.profile.removePhoneFailed'));
  }

  // Account deletion: online only; the session goes with the account.
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  async function confirmDeleteAccount() {
    if (!connectivity.getState().online) {
      setDeleteAccountError(t('user.profile.deleteAccount.offline'));
      return;
    }
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    await useNotificationsStore.getState().removeThisDevice();
    const deleted = await profileStore().deleteAccount();
    setIsDeletingAccount(false);
    if (!deleted) {
      setDeleteAccountError(t('user.profile.deleteAccount.failed'));
      return;
    }
    setShowDeleteAccount(false);
    await useAuthStore.getState().signOut();
    onClose();
    router.replace('/');
  }

  async function handleSignOut() {
    // Before signOut: the device row delete needs the session (#148). Bounded, never throws.
    await useNotificationsStore.getState().removeThisDevice();
    await useAuthStore.getState().signOut();
    onClose();
    router.replace('/');
  }

  const editForm = (
    <form key="edit" id="profile-edit-form" className={c('edit-form')} onSubmit={handleSave}>
      <div className={c('field')}>
        <label htmlFor="edit-first-name" className={c('label')}>
          {t('user.shared.firstNameLabel')}
        </label>
        <input
          id="edit-first-name"
          value={editFirstName}
          type="text"
          className={c('input')}
          autoComplete="given-name"
          onChange={(e) => setEditFirstName(e.target.value)}
        />
      </div>
      <div className={c('field')}>
        <label htmlFor="edit-last-name" className={c('label')}>
          {t('user.shared.lastNameLabel')}
        </label>
        <input
          id="edit-last-name"
          value={editLastName}
          type="text"
          className={c('input')}
          autoComplete="family-name"
          onChange={(e) => setEditLastName(e.target.value)}
        />
      </div>
      <div className={c('field')}>
        <label htmlFor="edit-phone" className={c('label')}>
          {t('user.shared.phoneLabel')}{' '}
          <span className={c('optional')}>{t('user.shared.optional')}</span>
        </label>
        <div className={c('phone-input-row')}>
          <input
            id="edit-phone"
            value={phoneInput.formatted}
            type="tel"
            className={c('input')}
            placeholder={t('user.shared.phonePlaceholder')}
            autoComplete="tel"
            disabled={!online}
            onChange={phoneInput.onInput}
          />
          {full?.phoneNumber && (
            <BaseTooltip text={t('user.profile.removePhoneBtn')}>
              <BaseIconButton
                name="delete"
                label={t('user.profile.removePhoneBtn')}
                data-testid="remove-phone-btn"
                shape="square"
                tone="danger"
                disabled={isRemovingPhone || showRemovePhoneConfirm || !online}
                onClick={() => void handleRemovePhone()}
              />
            </BaseTooltip>
          )}
        </div>
      </div>

      {/* Inline remove-phone confirmation (verified only) */}
      {showRemovePhoneConfirm && (
        <div className={c('remove-phone-confirm')}>
          <div className={c('remove-phone-warning')}>
            <BaseIcon name="warning" className={c('warn-icon')} />
            <div className={c('remove-phone-disclaimers')}>
              <p className={c('remove-phone-disclaimer')}>
                {t('user.profile.removePhoneDisclaimer')}
              </p>
              {removePhoneRelationships?.hasFriendship && removePhoneRelationships.hasPending ? (
                <p className={c('remove-phone-disclaimer')}>
                  {t('user.profile.removePhoneBothWarning')}
                </p>
              ) : removePhoneRelationships?.hasFriendship ? (
                <p className={c('remove-phone-disclaimer')}>
                  {t('user.profile.removePhoneFriendshipWarning')}
                </p>
              ) : removePhoneRelationships?.hasPending ? (
                <p className={c('remove-phone-disclaimer')}>
                  {t('user.profile.removePhonePendingWarning')}
                </p>
              ) : null}
            </div>
          </div>
          <div className={c('remove-phone-actions')}>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={isRemovingPhone}
              onClick={() => setShowRemovePhoneConfirm(false)}
            >
              {t('user.profile.removePhoneCancelBtn')}
            </BaseButton>
            <BaseButton
              type="button"
              variant="danger"
              size="sm"
              disabled={isRemovingPhone}
              onClick={() => void executeDeletePhone()}
            >
              {t('user.profile.removePhoneConfirmBtn')}
            </BaseButton>
          </div>
        </div>
      )}

      {editError && <p className={c('error-text')}>{editError}</p>}

      {!editAsPage && (
        <div className={c('edit-actions')}>
          <BaseButton type="button" variant="secondary" onClick={cancelEdit}>
            {t('user.shared.cancelBtn')}
          </BaseButton>
          <BaseButton type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? t('user.shared.savingBtn') : t('user.shared.saveBtn')}
          </BaseButton>
        </div>
      )}
    </form>
  );

  return (
    <>
      <AdaptiveOverlay
        title={title}
        page={view !== 'overview'}
        showBack={view !== 'overview'}
        onClose={onClose}
        onBack={goBack}
        pageAction={
          editAsPage ? (
            <BaseButton
              type="submit"
              form="profile-edit-form"
              variant="primary"
              size="sm"
              disabled={isSaving}
            >
              {isSaving ? t('user.shared.savingBtn') : t('user.shared.saveBtn')}
            </BaseButton>
          ) : undefined
        }
      >
        {/* Sections push/pop: forward slides in from the right, back from the left. */}
        <Transition name={view === 'overview' ? 'view-pop' : 'view-push'}>
          {view === 'overview' ? (
            <div key="overview">
              <ProfileOverview
                onOpen={openSection}
                onShowTour={handleShowTour}
                onSignOut={() => void handleSignOut()}
                onDeleteAccount={() => {
                  setDeleteAccountError(null);
                  setShowDeleteAccount(true);
                }}
              />
            </div>
          ) : view === 'notifications' ? (
            <div key="notifications">
              <NotificationPreferencesSection />
            </div>
          ) : view === 'calendar' ? (
            <div key="calendar">
              <CalendarSyncSettings />
            </div>
          ) : (
            editForm
          )}
        </Transition>
      </AdaptiveOverlay>

      {showDeleteAccount && (
        <DeleteAccountDialog
          deleting={isDeletingAccount}
          error={deleteAccountError}
          onConfirm={() => void confirmDeleteAccount()}
          onCancel={() => setShowDeleteAccount(false)}
        />
      )}
      {showVerificationNotice && (
        <PhoneVerificationNotice
          onAcknowledged={() => void handleNoticeAcknowledged()}
          onClose={() => setShowVerificationNotice(false)}
        />
      )}
      {showPhoneVerification && (
        <PhoneVerificationDialog
          phone={pendingPhone}
          onVerified={() => setShowPhoneVerification(false)}
          onClose={() => setShowPhoneVerification(false)}
        />
      )}
    </>
  );
}
