import type { Env } from '../config'
import type { Occurrence } from './parse-ics'
import { deriveAvailableDays } from './busy-days'
import { IcsParseError, parseIcs } from './parse-ics'
import { addDays, zurichDateKey, zurichWallTime } from './zurich'

const HORIZON_DAYS = 60
const MAX_BYTES = 2 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000

interface Feed {
  id: string
  url: string
  etag: string | null
  last_modified: string | null
  last_synced_at: string | null
}

interface Settings { core_start: string, core_end: string, min_free_minutes: number }
const DEFAULT_SETTINGS: Settings = { core_start: '06:00:00', core_end: '18:00:00', min_free_minutes: 360 }

export type SyncResult = 'synced' | 'unchanged' | 'failed' | 'no_feeds'

type Loaded
  = | { status: 'ok', occurrences: Occurrence[], etag: string | null, lastModified: string | null }
    | { status: 'not_modified' }
    | { status: 'error', code: string, httpStatus?: number }

export function rest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
}

async function restJson<T>(env: Env, path: string): Promise<T> {
  const res = await rest(env, path)
  if (!res.ok)
    throw new Error(`supabase ${res.status} on ${path.split('?')[0]}`)
  return res.json() as Promise<T>
}

/** Reads at most MAX_BYTES; the header may be absent or lie, so count while streaming too. */
async function readCapped(res: Response): Promise<string | null> {
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) {
    await res.body?.cancel()
    return null
  }
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    total += r.value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(r.value)
  }
  const buf = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    buf.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(buf)
}

async function loadFeed(feed: Feed, conditional: boolean, from: Date, to: Date): Promise<Loaded> {
  const headers: Record<string, string> = {}
  if (conditional && feed.etag)
    headers['If-None-Match'] = feed.etag
  if (conditional && feed.last_modified)
    headers['If-Modified-Since'] = feed.last_modified

  let res: Response
  try {
    res = await fetch(feed.url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  }
  catch (err) {
    return { status: 'error', code: (err as Error).name === 'TimeoutError' ? 'timeout' : 'network' }
  }
  if (res.status === 304)
    return conditional ? { status: 'not_modified' } : { status: 'error', code: 'http_304', httpStatus: 304 }
  if (!res.ok) {
    await res.body?.cancel()
    return { status: 'error', code: `http_${res.status}`, httpStatus: res.status }
  }

  const body = await readCapped(res)
  if (body === null)
    return { status: 'error', code: 'too_large', httpStatus: res.status }
  try {
    return {
      status: 'ok',
      occurrences: parseIcs(body, from, to),
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    }
  }
  catch (err) {
    if (err instanceof IcsParseError)
      return { status: 'error', code: err.code, httpStatus: res.status }
    throw err
  }
}

function patchFeed(env: Env, id: string, patch: Record<string, unknown>): Promise<Response> {
  return rest(env, `user_calendar_feeds?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

/**
 * Fetch every feed, derive, and write the 60-day horizon — or write nothing (design D5).
 * `conditional: false` (on-demand) skips the D6 conditional GET: it runs after changes no feed
 * can report — new settings, a removed feed — which an all-304 short-circuit would swallow.
 */
export async function syncUser(
  env: Env,
  userId: string,
  { now = new Date(), conditional = true } = {},
): Promise<SyncResult> {
  const uid = encodeURIComponent(userId)
  const [feeds, settingsRows] = await Promise.all([
    restJson<Feed[]>(env, `user_calendar_feeds?user_id=eq.${uid}&select=id,url,etag,last_modified,last_synced_at`),
    restJson<Settings[]>(env, `user_calendar_settings?user_id=eq.${uid}&select=core_start,core_end,min_free_minutes`),
  ])
  if (feeds.length === 0)
    return 'no_feeds'
  const settings = settingsRows[0] ?? DEFAULT_SETTINGS

  const today = zurichDateKey(now)
  const last = addDays(today, HORIZON_DAYS)
  const from = zurichWallTime(today)
  const to = zurichWallTime(addDays(last, 1))

  // D6: a 304 is only meaningful within the same local day — the horizon rolls daily.
  const sameDay = (f: Feed) => f.last_synced_at !== null && zurichDateKey(new Date(f.last_synced_at)) === today
  let loaded = await Promise.all(feeds.map(f => loadFeed(f, conditional && sameDay(f), from, to)))

  if (loaded.every(l => l.status === 'not_modified'))
    return 'unchanged'
  // Bodies are never stored (D8), so a 304 next to a changed feed leaves a hole in the union.
  // Refetch those unconditionally rather than derive from a partial set.
  if (loaded.some(l => l.status === 'not_modified')) {
    loaded = await Promise.all(feeds.map((f, i) =>
      loaded[i].status === 'not_modified' ? loadFeed(f, false, from, to) : loaded[i]))
  }

  // ponytail: fail closed on purpose. Deriving from the feeds that did respond has the same
  // silent-widening failure as an empty calendar, just smaller.
  const failed = feeds.flatMap((f, i) => {
    const l = loaded[i]
    return l.status === 'ok' ? [] : [{ feed: f, l: l as Extract<Loaded, { status: 'error' }> }]
  })
  if (failed.length > 0) {
    await Promise.all(failed.map(({ feed, l }) => {
      // D8: feed id + cause only — never the URL (bearer credential) or any body.
      console.error(`[calendar] feed ${feed.id} failed: ${l.code}${l.httpStatus ? ` (${l.httpStatus})` : ''}`)
      return patchFeed(env, feed.id, { last_error: l.code })
    }))
    return 'failed'
  }

  const ok = loaded as Extract<Loaded, { status: 'ok' }>[]
  const days = deriveAvailableDays(ok.flatMap(l => l.occurrences), {
    from: today,
    to: last,
    coreStart: settings.core_start,
    coreEnd: settings.core_end,
    minFreeMinutes: settings.min_free_minutes,
  })

  const rpc = await rest(env, 'rpc/apply_calendar_availability', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: userId, p_from: today, p_to: last, p_days: days }),
  })
  if (!rpc.ok)
    throw new Error(`apply_calendar_availability ${rpc.status}`)

  const syncedAt = now.toISOString()
  await Promise.all(feeds.map((f, i) => patchFeed(env, f.id, {
    last_error: null,
    etag: ok[i].etag,
    last_modified: ok[i].lastModified,
    last_synced_at: syncedAt,
  })))
  return 'synced'
}

/**
 * Cron: drop every availability row before today (Zurich). Nothing reads past days — the app
 * loads from `todayKey()` — so without this the table only grows. Covers users without feeds too.
 */
export async function purgePastAvailability(env: Env, now = new Date()): Promise<void> {
  const res = await rest(env, `user_availability?date=lt.${zurichDateKey(now)}`, { method: 'DELETE' })
  if (!res.ok)
    console.error(`[calendar] purge past availability failed: ${res.status}`)
}

/**
 * Cron: every user with at least one feed, one at a time, failures isolated per user.
 * ponytail: single invocation. Free plan ≈ users × (feeds + 3) subrequests of ~50, so this caps
 * out near ~10 users (design → Risks). Upgrade: paid plan, then Queues fan-out (one msg per user).
 */
export async function syncAllUsers(env: Env): Promise<void> {
  // ponytail: one page (PostgREST default max 1000 rows) — the subrequest cap bites long before.
  const rows = await restJson<{ user_id: string }[]>(env, 'user_calendar_feeds?select=user_id')
  for (const userId of new Set(rows.map(r => r.user_id))) {
    try {
      await syncUser(env, userId)
    }
    catch (err) {
      console.error(`[calendar] sync failed for user ${userId}: ${(err as Error).message}`)
    }
  }
}
