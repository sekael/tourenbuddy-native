import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { TFunction } from 'i18next';

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
