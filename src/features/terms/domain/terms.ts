/**
 * The terms of use the app ships (terms-acceptance): the date the text was settled. The backend
 * holds the version in force; both are ISO dates, so they compare as strings.
 */
export const TERMS_VERSION = '2026-11-22';

/** The version in force (the backend's) and the user's latest accepted one. */
export type TermsStatus = { current: string; accepted: string | null };

/**
 * - `pass`: the version in force is accepted and this app can show it (or a newer one).
 * - `accept`: never accepted; `changed`: an earlier version was accepted.
 * - `update`: this app is older than the version in force and cannot accept it.
 * - `unavailable`: this app is newer than the version in force, which was never accepted.
 */
export type TermsGate = 'pass' | 'accept' | 'changed' | 'update' | 'unavailable';

export function termsGate(bundled: string, status: TermsStatus): TermsGate {
  if (bundled < status.current) return 'update';
  if (status.accepted === status.current) return 'pass';
  if (bundled === status.current) return status.accepted ? 'changed' : 'accept';
  return 'unavailable';
}
