/**
 * One resolver for every link into the app (deep-links, D1): universal links on tourenbuddy.ch and
 * test.tourenbuddy.ch (the Worker's current `APP_URL`), the app's own schemes, and the `url` a push
 * carries. A notification id (`?notification=<id>`) goes to the root, which opens it once signed in;
 * a known app path passes through; anything else opens the map. Plain string parsing: no `URL`,
 * so it behaves the same on Hermes and in Jest.
 */
const HOSTS = new Set(['tourenbuddy.ch', 'www.tourenbuddy.ch', 'test.tourenbuddy.ch']);
const SCHEMES = new Set(['tourenbuddy', 'tourenbuddy-dev']);
/** First path segments of the app's routes (`src/app`). */
const APP_PATHS = new Set([
  'calendar',
  'contacts',
  'profile',
  'tours',
  'tour',
  'contact',
  'inbox',
  'tour-overlaps',
]);
const LINK = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i;
const ID = /^[\w-]{1,64}$/;

/** The notification id a link carries, if any. */
export function notificationIdIn(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const id = /[?&]notification=([^&#]*)/.exec(url)?.[1];
  return id && ID.test(id) ? id : null;
}

/** The app path a link opens. */
export function resolveLink(url: string): string {
  let path: string;
  let query: string;
  if (url.startsWith('/')) {
    [path = '/', query = ''] = url.split(/(?=\?)/);
  } else {
    const match = LINK.exec(url.trim());
    if (!match) return '/';
    const [, scheme, host = '', rest = '', search = ''] = match;
    const lower = scheme!.toLowerCase();
    if (SCHEMES.has(lower)) {
      // `tourenbuddy://contacts/…`: the "host" is the first segment.
      path = `/${host}${rest}`;
    } else if ((lower === 'https' || lower === 'http') && HOSTS.has(host.toLowerCase())) {
      path = rest || '/';
    } else {
      return '/';
    }
    query = search;
  }

  const notification = notificationIdIn(query);
  if (notification) return `/?notification=${notification}`;

  const clean = path.replace(/\/+$/, '') || '/';
  const first = clean.split('/')[1] ?? '';
  if (clean === '/' || !APP_PATHS.has(first)) return '/';
  return clean + (query.length > 1 ? query : '');
}

/**
 * A link that arrived before the session was known (signed out, or a cold start still restoring):
 * the sign-in redirect drops it, so it waits here until the root follows it after sign-in.
 */
let pending: string | null = null;

export function holdLink(target: string | null): void {
  pending = target;
}

export function takeLink(): string | null {
  const target = pending;
  pending = null;
  return target;
}
