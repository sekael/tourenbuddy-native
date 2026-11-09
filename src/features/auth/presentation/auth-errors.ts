import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { TFunction } from 'i18next';

import { PasskeyError } from '../data/passkeys';

/**
 * Seconds the server asks to wait before sending another code: its 429 says
 * "…you can only request this after 42 seconds." Undefined for any other error.
 */
export function rateLimitWait(error: unknown): number | undefined {
  if (!isAuthApiError(error)) return undefined;
  if (error.status !== 429 && error.code !== 'over_email_send_rate_limit') return undefined;
  const seconds = Number(/(\d+) seconds?/.exec(error.message)?.[1]);
  return seconds > 0 ? seconds : 60;
}

/** The request never reached the auth server (auth-js reports that as status 0). */
export const isOffline = (error: unknown) => isAuthRetryableFetchError(error) && error.status === 0;

/** Why sending the code failed, in the app's language (Supabase's own messages are English). */
export function sendErrorMessage(error: unknown, t: TFunction): string {
  if (isOffline(error)) return t('offline.actionUnavailable');
  const wait = rateLimitWait(error);
  if (wait) return t('auth.emailEntry.rateLimited', { count: wait });
  if (isAuthApiError(error) && error.code === 'email_address_invalid') {
    return t('auth.emailEntry.invalidEmail');
  }
  return t('auth.emailEntry.sendError');
}

/** Why a password sign-in failed, in the app's language. */
export function signInErrorMessage(error: unknown, t: TFunction): string {
  if (isOffline(error)) return t('offline.actionUnavailable');
  if (isAuthApiError(error)) {
    // Also what an account without a password answers.
    if (error.code === 'invalid_credentials') return t('auth.signIn.wrongCredentials');
    // Only an account made through `/signup` directly; the code confirms the address.
    if (error.code === 'email_not_confirmed') return t('auth.signIn.notConfirmed');
    if (error.status === 429) return t('auth.signIn.tooManyAttempts');
  }
  return t('auth.signIn.signInError');
}

/** Why setting a password failed, in the app's language. */
export function passwordErrorMessage(error: unknown, t: TFunction): string {
  if (isOffline(error)) return t('offline.actionUnavailable');
  if (isAuthApiError(error) && error.code === 'same_password') return t('auth.password.same');
  if (isAuthApiError(error) && error.code === 'weak_password') return t('auth.password.weak');
  return t('auth.password.saveError');
}

/** What to say about a failed passkey action; nothing when the user cancelled the sheet. */
export function passkeyErrorMessage(error: unknown, t: TFunction): string | null {
  const reason = error instanceof PasskeyError ? error.reason : 'failed';
  switch (reason) {
    case 'cancelled':
      return null;
    case 'offline':
      return t('offline.actionUnavailable');
    case 'noCredentials':
      return t('auth.passkey.noCredentials');
    case 'unknownCredential':
      return t('auth.passkey.unknown');
    case 'exists':
      return t('auth.passkey.exists');
    case 'tooMany':
      return t('auth.passkey.tooMany');
    default:
      return t('auth.passkey.failed');
  }
}
