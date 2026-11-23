import { router } from 'expo-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { InvalidPhoneNumberError } from '@/core/exceptions';
import { BaseButton } from '@/core/web/base-button.web';
import { classes } from '@/core/web/classes';
import { useAsYouTypePhone } from '@/core/web/use-as-you-type-phone.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { PhoneVerificationNotice } from '@/features/friendships/presentation/web/phone-verification-notice.web';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import styles from './onboarding-page.module.css';
import { PhoneVerificationDialog } from './phone-verification-dialog.web';

const c = classes(styles);

type Errors = { firstName?: string; lastName?: string; phoneNumber?: string };

/** The PWA's onboarding page: first and last name (required), a phone number to be found by. */
export function OnboardingPage() {
  const { t } = useTranslation('web');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const phone = useAsYouTypePhone(phoneNumber, setPhoneNumber);
  const [errors, setErrors] = useState<Errors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [showVerificationNotice, setShowVerificationNotice] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingPhoneForNotice, setPendingPhoneForNotice] = useState('');

  useEffect(() => {
    void (async () => {
      const store = useUserProfileStore.getState();
      if (!store.profile) await store.loadProfile();
      const profile = useUserProfileStore.getState().profile;
      if (profile) {
        setFirstName(profile.firstName ?? '');
        setLastName(profile.lastName ?? '');
      }
      const authPhone = useAuthStore.getState().user?.phone;
      if (profile && authPhone) setPhoneNumber(authPhone);
    })();
  }, []);

  function validate() {
    const next: Errors = {};
    if (!firstName.trim()) next.firstName = t('user.onboarding.firstNameRequired');
    if (!lastName.trim()) next.lastName = t('user.onboarding.lastNameRequired');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    setSubmitError(null);
    try {
      await useUserProfileStore.getState().updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      const value = phoneNumber.trim();
      if (value) {
        // The discoverability notice comes before the code is sent.
        setPendingPhoneForNotice(value);
        setShowVerificationNotice(true);
      } else router.push('/map');
    } catch (err) {
      if (err instanceof InvalidPhoneNumberError)
        setErrors((x) => ({ ...x, phoneNumber: err.message }));
      else
        setSubmitError(
          err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSkip() {
    useUserProfileStore.getState().skipOnboarding();
    router.push('/map');
  }

  async function handleNoticeAcknowledged() {
    setShowVerificationNotice(false);
    setIsLoading(true);
    try {
      await useUserProfileStore.getState().sendPhoneVerification(pendingPhoneForNotice);
      setPendingPhone(pendingPhoneForNotice);
      setShowPhoneVerification(true);
    } catch (err) {
      if (err instanceof InvalidPhoneNumberError)
        setErrors((x) => ({ ...x, phoneNumber: err.message }));
      else setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  const done = () => {
    setShowPhoneVerification(false);
    router.push('/map');
  };

  return (
    <div className={c('page')}>
      <div className={c('card')}>
        <h1 className={c('title')}>{t('user.onboarding.title')}</h1>
        <p className={c('subtitle')}>{t('user.onboarding.subtitle')}</p>

        <form className={c('form')} onSubmit={(e) => void handleSubmit(e)}>
          <div className={c('field')}>
            <label htmlFor="firstName" className={c('label')}>
              {t('user.shared.firstNameLabel')}{' '}
              <span className={c('required')}>{t('user.shared.required')}</span>
            </label>
            <input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              type="text"
              className={c('input', { 'input--error': errors.firstName })}
              placeholder={t('user.shared.firstNamePlaceholder')}
              autoComplete="given-name"
            />
            {errors.firstName && <p className={c('error-text')}>{errors.firstName}</p>}
          </div>

          <div className={c('field')}>
            <label htmlFor="lastName" className={c('label')}>
              {t('user.shared.lastNameLabel')}{' '}
              <span className={c('required')}>{t('user.shared.required')}</span>
            </label>
            <input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              type="text"
              className={c('input', { 'input--error': errors.lastName })}
              placeholder={t('user.shared.lastNamePlaceholder')}
              autoComplete="family-name"
            />
            {errors.lastName && <p className={c('error-text')}>{errors.lastName}</p>}
          </div>

          <div className={c('field')}>
            <label htmlFor="phoneNumber" className={c('label')}>
              {t('user.shared.phoneLabel')}{' '}
              <span className={c('optional')}>{t('user.shared.optional')}</span>
            </label>
            <input
              id="phoneNumber"
              value={phone.formatted}
              onChange={phone.onInput}
              type="tel"
              className={c('input', { 'input--error': errors.phoneNumber })}
              placeholder={t('user.shared.phonePlaceholder')}
              autoComplete="tel"
            />
            {errors.phoneNumber && <p className={c('error-text')}>{errors.phoneNumber}</p>}
          </div>

          {submitError && <p className={c('error-text')}>{submitError}</p>}

          <BaseButton type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? t('user.shared.savingBtn') : t('user.onboarding.continueBtn')}
          </BaseButton>
        </form>

        <BaseButton variant="text" size="sm" data-testid="skip-btn" onClick={handleSkip}>
          {t('user.onboarding.skipBtn')}
        </BaseButton>
      </div>

      {showVerificationNotice && (
        <PhoneVerificationNotice
          onAcknowledged={() => void handleNoticeAcknowledged()}
          onClose={() => setShowVerificationNotice(false)}
        />
      )}
      {showPhoneVerification && (
        <PhoneVerificationDialog phone={pendingPhone} onVerified={done} onClose={done} />
      )}
    </div>
  );
}
