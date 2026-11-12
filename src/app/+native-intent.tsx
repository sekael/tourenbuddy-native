import { sessionUser } from '@/core/auth/session-user';
import { holdLink, resolveLink } from '@/core/links/resolve';

/**
 * Every link that opens the app (universal links, the app's scheme, a cold start from one) goes
 * through the one resolver (deep-links). Before the session is known the target is also held, and
 * the root follows it after sign-in.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const target = resolveLink(path);
    if (!sessionUser.getState().id) holdLink(target);
    return target;
  } catch {
    return '/';
  }
}
