import type { Env } from './config'
import type { PushPayload } from './push'

/**
 * Native push (change: add-native-backend, design D1–D4): iOS tokens go to APNs directly, Android
 * tokens to FCM HTTP v1. Credentials are signed with WebCrypto and cached per isolate.
 */

export interface DeviceTokenRow {
  id: string
  user_id: string
  platform: 'ios' | 'android'
  token: string
  app_id: string
  apns_environment: 'development' | 'production' | null
}

/** What became of one send: delivered, the token is gone (delete its row), or a transient failure. */
export type SendOutcome = 'sent' | 'stale' | 'failed'

// ── Shared helpers ───────────────────────────────────────────────────────────

function base64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The DER body of a PEM private key (PKCS #8, as both Apple's .p8 and Google's JSON hold). */
function pemBody(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function signJwt(
  header: Record<string, string>,
  claims: Record<string, string | number>,
  key: CryptoKey,
  algorithm: Parameters<SubtleCrypto['sign']>[0],
): Promise<string> {
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`
  // WebCrypto's ECDSA signature is already raw r||s, which is what JWS ES256 wants.
  const signature = await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(input))
  return `${input}.${base64url(signature)}`
}

// ── APNs ─────────────────────────────────────────────────────────────────────

// Apple rejects a token older than an hour and throttles fresh ones: re-sign every 50 minutes.
const APNS_TOKEN_TTL_S = 50 * 60
let apnsToken: { jwt: string, issuedAt: number, keyId: string } | null = null

async function apnsJwt(env: Env, now: number): Promise<string> {
  if (apnsToken && apnsToken.keyId === env.APNS_KEY_ID && now - apnsToken.issuedAt < APNS_TOKEN_TTL_S)
    return apnsToken.jwt
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBody(env.APNS_PRIVATE_KEY!),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const jwt = await signJwt(
    { alg: 'ES256', kid: env.APNS_KEY_ID! },
    { iss: env.APNS_TEAM_ID!, iat: now },
    key,
    { name: 'ECDSA', hash: 'SHA-256' },
  )
  apnsToken = { jwt, issuedAt: now, keyId: env.APNS_KEY_ID! }
  return jwt
}

const APNS_STALE_REASONS = new Set(['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic'])

export function apnsConfigured(env: Env): boolean {
  return Boolean(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY)
}

export async function sendApns(row: DeviceTokenRow, payload: PushPayload, env: Env): Promise<SendOutcome> {
  const host = row.apns_environment === 'development'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
  let res: Response
  try {
    const jwt = await apnsJwt(env, Math.floor(Date.now() / 1000))
    res = await fetch(`${host}/3/device/${row.token}`, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': row.app_id,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        // A day, as Web Push's TTL: a phone off for longer gets the inbox, not a stale banner.
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 60 * 60 * 24),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        aps: {
          alert: { title: payload.title, body: payload.body },
          sound: 'default',
          ...(payload.badge === undefined ? {} : { badge: payload.badge }),
        },
        url: payload.url,
      }),
    })
  }
  catch (err) {
    console.warn(`[apns] network error: ${(err as Error).message}`)
    return 'failed'
  }
  if (res.ok)
    return 'sent'
  const reason = ((await res.json().catch(() => ({}))) as { reason?: string }).reason ?? ''
  if (res.status === 410 || (res.status === 400 && APNS_STALE_REASONS.has(reason)))
    return 'stale'
  if (res.status === 403 && reason === 'ExpiredProviderToken')
    apnsToken = null
  console.warn(`[apns] ${res.status} ${reason}`)
  return 'failed'
}

// ── FCM HTTP v1 ──────────────────────────────────────────────────────────────

interface ServiceAccount { client_email: string, private_key: string, project_id: string }
let fcmToken: { accessToken: string, expiresAt: number, clientEmail: string } | null = null

function serviceAccount(env: Env): ServiceAccount | null {
  try {
    const parsed = JSON.parse(env.FCM_SERVICE_ACCOUNT ?? '') as Partial<ServiceAccount>
    return parsed.client_email && parsed.private_key && parsed.project_id
      ? (parsed as ServiceAccount)
      : null
  }
  catch {
    return null
  }
}

export function fcmConfigured(env: Env): boolean {
  return serviceAccount(env) !== null
}

async function fcmAccessToken(account: ServiceAccount, now: number): Promise<string | null> {
  // Reused until five minutes before Google's expiry.
  if (fcmToken && fcmToken.clientEmail === account.client_email && now < fcmToken.expiresAt - 300)
    return fcmToken.accessToken
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBody(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assertion = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    key,
    { name: 'RSASSA-PKCS1-v1_5' },
  )
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    console.warn(`[fcm] token exchange ${res.status}`)
    return null
  }
  const body = (await res.json()) as { access_token: string, expires_in: number }
  fcmToken = { accessToken: body.access_token, expiresAt: now + body.expires_in, clientEmail: account.client_email }
  return body.access_token
}

interface FcmError {
  status?: string
  details?: { errorCode?: string, fieldViolations?: { field?: string }[] }[]
}

/**
 * The token is gone (UNREGISTERED, 404) or not a token (INVALID_ARGUMENT naming `message.token`).
 * Any other INVALID_ARGUMENT is our payload's fault and must not cost the user their device.
 */
function fcmTokenGone(httpStatus: number, error: FcmError | undefined): boolean {
  const details = error?.details ?? []
  if (httpStatus === 404 || details.some(d => d.errorCode === 'UNREGISTERED'))
    return true
  return error?.status === 'INVALID_ARGUMENT'
    && details.some(d => d.fieldViolations?.some(v => v.field === 'message.token'))
}

export async function sendFcm(row: DeviceTokenRow, payload: PushPayload, env: Env): Promise<SendOutcome> {
  const account = serviceAccount(env)
  if (!account)
    return 'failed'
  let res: Response
  try {
    const accessToken = await fcmAccessToken(account, Math.floor(Date.now() / 1000))
    if (!accessToken)
      return 'failed'
    res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: row.token,
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url },
          android: { priority: 'high', ttl: '86400s' },
        },
      }),
    })
  }
  catch (err) {
    console.warn(`[fcm] network error: ${(err as Error).message}`)
    return 'failed'
  }
  if (res.ok)
    return 'sent'
  const error = ((await res.json().catch(() => ({}))) as { error?: FcmError }).error
  if (fcmTokenGone(res.status, error))
    return 'stale'
  if (res.status === 401)
    fcmToken = null
  console.warn(`[fcm] ${res.status} ${error?.status ?? ''}`)
  return 'failed'
}

/** Test seam: forget cached credentials. */
export function resetNativePushCache(): void {
  apnsToken = null
  fcmToken = null
}
