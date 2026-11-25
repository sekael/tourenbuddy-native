import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { resetNativePushCache } from '../src/native-push'

// Change: add-native-backend. Failure paths of native push, account deletion, moderation, CORS.

vi.mock('@block65/webcrypto-web-push', () => ({
  buildPushPayload: vi.fn(async (msg: { data: string }) => ({ method: 'POST', body: msg.data })),
}))

const BASE_ENV = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  NOTIFY_WEBHOOK_SECRET: 'notify-secret',
  BREVO_API_KEY: 'brevo',
  APP_URL: 'https://tourenbuddy.ch',
}
const USER = '11111111-1111-1111-1111-111111111111'

async function pem(key: CryptoKey): Promise<string> {
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', key) as ArrayBuffer)
  let binary = ''
  for (const b of der) binary += String.fromCharCode(b)
  return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`
}

let apnsKey = ''
let fcmAccount = ''
beforeAll(async () => {
  const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair
  apnsKey = await pem(ec.privateKey)
  const rsa = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign'],
  ) as CryptoKeyPair
  fcmAccount = JSON.stringify({ client_email: 'push@proj.iam.gserviceaccount.com', private_key: await pem(rsa.privateKey), project_id: 'proj' })
})

type Route = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

/** A fetch that answers by URL; unmatched calls answer 200 `[]`. Records every call. */
function stubFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const route of routes) {
      const res = await route(url, init)
      if (res)
        return res
    }
    return json(200, [])
  })
  globalThis.fetch = fn as unknown as typeof fetch
  return fn
}
function calls(fn: ReturnType<typeof stubFetch>, part: string) {
  return fn.mock.calls.filter(([url]) => String(url).includes(part))
}

function notifyEvent() {
  return new Request('https://worker.example.com/notify/event', {
    method: 'POST',
    headers: { 'x-notify-secret': 'notify-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'n-1', recipient_id: USER, type: 'friend_requests', action: 'received', actor_name: 'Jakob', tour_name: null }),
  })
}

const profileRoute: Route = url =>
  url.includes('/rest/v1/user_profile')
    ? json(200, [{ notif_email_enabled: false, notif_muted_types: [], locale: 'en' }])
    : undefined

function tokensRoute(rows: object[]): Route {
  return url => (url.includes('/rest/v1/device_push_tokens?user_id') ? json(200, rows) : undefined)
}
const iosRow = { id: 't-1', user_id: USER, platform: 'ios', token: 'abc', app_id: 'ch.tourenbuddy.app.dev', apns_environment: 'development' }
const androidRow = { id: 't-2', user_id: USER, platform: 'android', token: 'fcm-tok', app_id: 'ch.tourenbuddy.app', apns_environment: null }

describe('native push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNativePushCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('sends development tokens to the APNs sandbox with the app as topic and the deep link', async () => {
    const fetchFn = stubFetch([profileRoute, tokensRoute([iosRow]), url => (url.includes('push.apple.com') ? new Response(null, { status: 200 }) : undefined)])
    const res = await worker.fetch(notifyEvent(), { ...BASE_ENV, APNS_KEY_ID: 'KEY', APNS_TEAM_ID: 'TEAM', APNS_PRIVATE_KEY: apnsKey } as never)
    expect(res.status).toBe(200)
    const [[url, init]] = calls(fetchFn, 'push.apple.com')
    expect(url).toBe('https://api.sandbox.push.apple.com/3/device/abc')
    const headers = init!.headers as Record<string, string>
    expect(headers['apns-topic']).toBe('ch.tourenbuddy.app.dev')
    expect(headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/)
    expect(JSON.parse(init!.body as string).url).toBe('https://tourenbuddy.ch/?notification=n-1')
  })

  it('badges the app icon with the unread count, and still pushes when the count fails', async () => {
    const apns = { ...BASE_ENV, APNS_KEY_ID: 'KEY', APNS_TEAM_ID: 'TEAM', APNS_PRIVATE_KEY: apnsKey } as never
    const sent: Route = url => (url.includes('push.apple.com') ? new Response(null, { status: 200 }) : undefined)
    for (const [count, badge] of [[new Response(null, { status: 200, headers: { 'content-range': '0-2/3' } }), 3], [json(500, {}), undefined]] as const) {
      const fetchFn = stubFetch([profileRoute, tokensRoute([iosRow]), url => (url.includes('/rest/v1/notifications?recipient_id') ? count.clone() : undefined), sent])
      await worker.fetch(notifyEvent(), apns)
      const [[, init]] = calls(fetchFn, 'push.apple.com')
      expect(JSON.parse(init!.body as string).aps.badge).toBe(badge)
      expect(calls(fetchFn, '/rest/v1/notifications?recipient_id')[0][0]).toContain('read_at=is.null')
    }
  })

  it('deletes the row of a token APNs reports unregistered, keeps it on a server error', async () => {
    for (const [status, reason, deleted] of [[410, 'Unregistered', 1], [400, 'BadDeviceToken', 1], [500, 'InternalServerError', 0], [429, 'TooManyRequests', 0]] as const) {
      resetNativePushCache()
      const fetchFn = stubFetch([profileRoute, tokensRoute([iosRow]), url => (url.includes('push.apple.com') ? json(status, { reason }) : undefined)])
      await worker.fetch(notifyEvent(), { ...BASE_ENV, APNS_KEY_ID: 'KEY', APNS_TEAM_ID: 'TEAM', APNS_PRIVATE_KEY: apnsKey } as never)
      const deletes = calls(fetchFn, 'device_push_tokens?id=eq.t-1').filter(([, init]) => init?.method === 'DELETE')
      expect(deletes.length, `${status} ${reason}`).toBe(deleted)
    }
  })

  it('skips a platform without credentials and still answers 200', async () => {
    const fetchFn = stubFetch([profileRoute, tokensRoute([iosRow, androidRow])])
    const res = await worker.fetch(notifyEvent(), BASE_ENV as never)
    expect(res.status).toBe(200)
    expect(calls(fetchFn, 'push.apple.com')).toHaveLength(0)
    expect(calls(fetchFn, 'fcm.googleapis.com')).toHaveLength(0)
  })

  it('exchanges the service account once and deletes an unregistered FCM token', async () => {
    const fetchFn = stubFetch([
      profileRoute,
      tokensRoute([androidRow]),
      url => (url.includes('oauth2.googleapis.com') ? json(200, { access_token: 'ya29', expires_in: 3600 }) : undefined),
      url => (url.includes('fcm.googleapis.com')
        ? json(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } })
        : undefined),
    ])
    const env = { ...BASE_ENV, FCM_SERVICE_ACCOUNT: fcmAccount }
    await worker.fetch(notifyEvent(), env as never)
    await worker.fetch(notifyEvent(), env as never)
    expect(calls(fetchFn, 'oauth2.googleapis.com')).toHaveLength(1)
    const [[, init]] = calls(fetchFn, 'fcm.googleapis.com')
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer ya29')
    expect(JSON.parse(init!.body as string).message.data.url).toBe('https://tourenbuddy.ch/?notification=n-1')
    expect(calls(fetchFn, 'device_push_tokens?id=eq.t-2').filter(([, i]) => i?.method === 'DELETE')).toHaveLength(2)
  })

  it('keeps the token when FCM blames the payload, not the token', async () => {
    const fetchFn = stubFetch([
      profileRoute,
      tokensRoute([androidRow]),
      url => (url.includes('oauth2.googleapis.com') ? json(200, { access_token: 'ya29', expires_in: 3600 }) : undefined),
      url => (url.includes('fcm.googleapis.com')
        ? json(400, { error: { status: 'INVALID_ARGUMENT', details: [{ fieldViolations: [{ field: 'message.data' }] }] } })
        : undefined),
    ])
    await worker.fetch(notifyEvent(), { ...BASE_ENV, FCM_SERVICE_ACCOUNT: fcmAccount } as never)
    expect(calls(fetchFn, 'device_push_tokens?id=eq.t-2').filter(([, i]) => i?.method === 'DELETE')).toHaveLength(0)
  })

  it('treats a malformed service account as not configured', async () => {
    const fetchFn = stubFetch([profileRoute, tokensRoute([androidRow])])
    const res = await worker.fetch(notifyEvent(), { ...BASE_ENV, FCM_SERVICE_ACCOUNT: '{"client_email":"x"}' } as never)
    expect(res.status).toBe(200)
    expect(calls(fetchFn, 'oauth2.googleapis.com')).toHaveLength(0)
  })
})

function deleteRequest(headers: Record<string, string> = { Authorization: 'Bearer jwt' }) {
  return new Request('https://worker.example.com/account/delete', { method: 'POST', headers })
}
const authOk: Route = url => (url.endsWith('/auth/v1/user') ? json(200, { id: USER }) : undefined)

describe('pOST /account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('answers 401 and deletes nothing without a valid JWT', async () => {
    const fetchFn = stubFetch([url => (url.endsWith('/auth/v1/user') ? json(401, {}) : undefined)])
    expect((await worker.fetch(deleteRequest(), BASE_ENV as never)).status).toBe(401)
    expect((await worker.fetch(deleteRequest({}), BASE_ENV as never)).status).toBe(401)
    expect(fetchFn.mock.calls.filter(([, i]) => i?.method === 'DELETE')).toHaveLength(0)
  })

  it('deletes objects before the user, never another user\'s object', async () => {
    const fetchFn = stubFetch([
      authOk,
      url => (url.includes('rpc/account_storage_objects')
        ? json(200, [
            { bucket_id: 'tour-gpx', name: `${USER}/t.gpx` },
            { bucket_id: 'tour-attachments', name: `${USER}/t/a.pdf` },
            { bucket_id: 'tour-attachments', name: 'someone-else/t/b.pdf' },
          ])
        : undefined),
    ])
    const res = await worker.fetch(deleteRequest(), BASE_ENV as never)
    expect(res.status).toBe(200)
    const deletes = fetchFn.mock.calls.filter(([, i]) => i?.method === 'DELETE').map(([url, i]) => [String(url), i?.body])
    expect(deletes).toEqual([
      ['https://proj.supabase.co/storage/v1/object/tour-gpx', JSON.stringify({ prefixes: [`${USER}/t.gpx`] })],
      ['https://proj.supabase.co/storage/v1/object/tour-attachments', JSON.stringify({ prefixes: [`${USER}/t/a.pdf`] })],
      [`https://proj.supabase.co/auth/v1/admin/users/${USER}`, undefined],
    ])
  })

  it('keeps the account when a storage delete fails', async () => {
    const fetchFn = stubFetch([
      authOk,
      url => (url.includes('rpc/account_storage_objects') ? json(200, [{ bucket_id: 'tour-gpx', name: `${USER}/t.gpx` }]) : undefined),
      (url, init) => (url.includes('/storage/v1/object/') && init?.method === 'DELETE' ? json(500, {}) : undefined),
    ])
    expect((await worker.fetch(deleteRequest(), BASE_ENV as never)).status).toBe(502)
    expect(calls(fetchFn, '/auth/v1/admin/users/')).toHaveLength(0)
  })

  it('treats an already deleted user as done, other failures as 502', async () => {
    stubFetch([authOk, url => (url.includes('/auth/v1/admin/users/') ? json(404, {}) : undefined)])
    expect((await worker.fetch(deleteRequest(), BASE_ENV as never)).status).toBe(200)
    stubFetch([authOk, url => (url.includes('/auth/v1/admin/users/') ? json(500, {}) : undefined)])
    expect((await worker.fetch(deleteRequest(), BASE_ENV as never)).status).toBe(502)
  })

  it('sends no CORS headers to a native client (no Origin), CORS to the native web app', async () => {
    stubFetch([authOk])
    const native = await worker.fetch(deleteRequest(), BASE_ENV as never)
    expect(native.headers.get('Access-Control-Allow-Origin')).toBeNull()
    const web = await worker.fetch(
      deleteRequest({ Authorization: 'Bearer jwt', Origin: 'https://feat-x.tourenbuddy-native.pages.dev' }),
      BASE_ENV as never,
    )
    expect(web.headers.get('Access-Control-Allow-Origin')).toBe('https://feat-x.tourenbuddy-native.pages.dev')
    const evil = await worker.fetch(
      deleteRequest({ Authorization: 'Bearer jwt', Origin: 'https://evil.pages.dev.attacker.com' }),
      BASE_ENV as never,
    )
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

function reportRequest(secret = 'notify-secret', body: unknown = { id: 7, reporter_user_id: USER, reported_user_id: null, reason: '<b>spam</b>', created_at: '2026-11-09T08:00:00Z' }) {
  return new Request('https://worker.example.com/moderation/report', {
    method: 'POST',
    headers: { 'x-notify-secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('pOST /moderation/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects a wrong secret and sends nothing', async () => {
    const fetchFn = stubFetch([])
    expect((await worker.fetch(reportRequest('nope'), { ...BASE_ENV, MODERATION_EMAIL: 'mod@x.ch' } as never)).status).toBe(401)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('skips without a moderation address', async () => {
    const fetchFn = stubFetch([])
    const res = await worker.fetch(reportRequest(), BASE_ENV as never)
    expect(await res.json()).toEqual({ skipped: 'no_moderation_email' })
    expect(calls(fetchFn, 'brevo')).toHaveLength(0)
  })

  it('emails the operator with escaped text and a deleted account named as such', async () => {
    const fetchFn = stubFetch([
      url => (url.includes('/rest/v1/user_profile') ? json(200, [{ first_name: 'Anna', last_name: null }]) : undefined),
      url => (url.includes('/auth/v1/admin/users/') ? json(200, { email: 'anna@x.ch' }) : undefined),
    ])
    const res = await worker.fetch(reportRequest(), { ...BASE_ENV, MODERATION_EMAIL: 'mod@x.ch' } as never)
    expect(res.status).toBe(200)
    const [[, init]] = calls(fetchFn, 'api.brevo.com')
    const body = JSON.parse(init!.body as string)
    expect(body.to).toEqual([{ email: 'mod@x.ch' }])
    expect(body.htmlContent).toContain('&lt;b&gt;spam&lt;/b&gt;')
    expect(body.htmlContent).toContain('Anna &lt;anna@x.ch&gt;')
    expect(body.htmlContent).toContain('(deleted account)')
  })

  it('answers 502 when the email fails, so pg_net logs it', async () => {
    stubFetch([url => (url.includes('api.brevo.com') ? json(500, {}) : undefined)])
    expect((await worker.fetch(reportRequest(), { ...BASE_ENV, MODERATION_EMAIL: 'mod@x.ch' } as never)).status).toBe(502)
  })
})
