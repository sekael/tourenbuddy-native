import type { TermsGate } from '@/features/terms/domain/terms';

/** What the PWA's router guard read (its `beforeEach`), at the moment of a navigation. */
export type WebRouteState = {
  signedIn: boolean;
  gate: TermsGate | 'loading';
  profile: { firstName: string | null; lastName: string | null } | null;
  /** The profile's first load for this user has settled (it may still be `null`: unknown). */
  profileKnown: boolean;
  /** The name step was skipped this session. */
  sessionSkipped: boolean;
  /** Offline or on an unverified session: a `null` profile is unknown, not incomplete. */
  cannotLoad: boolean;
};

type Meta = { requiresAuth?: true; redirectIfAuth?: true; requiresCompleteProfile?: true };

const signedOut: Meta = { redirectIfAuth: true };
const page: Meta = { requiresAuth: true, requiresCompleteProfile: true };

/** The PWA's routes (`src/app/router/index.ts` there); the terms gate moved to `/accept-terms`. */
function metaOf(path: string): Meta | null {
  if (path === '/' || path === '/auth/verify-otp') return signedOut;
  if (path === '/accept-terms' || path === '/onboarding') return { requiresAuth: true };
  if (path === '/map' || path === '/calendar') return page;
  if (/^\/friends\/[^/]+\/backfill-collisions$/.test(path)) return page;
  return null;
}

/**
 * Where the web app sends a user standing at `path` (port-pwa-web D4), the PWA's guard as one pure
 * function: a path to go to, `null` to stay, or `'wait'` while the session, the terms or the profile
 * are not known yet. Any address the PWA didn't have leads to the map, or to sign-in.
 */
export function webRedirect(path: string, s: WebRouteState): string | null | 'wait' {
  const meta = metaOf(path);
  if (!meta) return s.signedIn ? '/map' : '/';
  if (meta.requiresAuth && !s.signedIn) return '/';
  if (!s.signedIn) return null;

  // Terms first (terms-acceptance), before any page, onboarding included.
  if (s.gate === 'loading') return 'wait';
  const accepted = s.gate === 'pass';
  if (!accepted) return path === '/accept-terms' ? null : '/accept-terms';
  if (path === '/accept-terms') return '/map';

  if (meta.redirectIfAuth) return '/map';

  if (!s.profileKnown) return 'wait';
  const { profile } = s;
  if (path === '/onboarding')
    return profile && profile.firstName !== null && profile.lastName !== null ? '/map' : null;

  // An unknown profile (offline, unverified session) is never sent to onboarding: retyping the
  // name there would queue an update that overwrites the server profile on replay.
  if (s.cannotLoad && profile === null) return null;
  const complete = profile !== null && profile.firstName !== null && profile.lastName !== null;
  return !complete && !s.sessionSkipped ? '/onboarding' : null;
}
