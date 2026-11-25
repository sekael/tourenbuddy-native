import type { PushSubscription, VapidKeys } from '@block65/webcrypto-web-push'
import type { Env } from './config'
import type { DeviceTokenRow, SendOutcome } from './native-push'
import { buildPushPayload } from '@block65/webcrypto-web-push'
import { apnsConfigured, fcmConfigured, sendApns, sendFcm } from './native-push'

export interface PushPayload {
  title: string
  body: string
  url: string
  /** iOS only: the app icon's badge, the user's unread inbox entries. */
  badge?: number
}

export interface PushSubscriptionRow {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Sends a push notification to a single subscription.
 * Returns the HTTP status from the push service (201 = delivered, 410/404 = stale).
 */
export async function sendPushNotification(
  subscription: PushSubscriptionRow,
  payload: PushPayload,
  env: Env,
): Promise<number> {
  const vapid: VapidKeys = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  }

  const pushSubscription: PushSubscription = {
    endpoint: subscription.endpoint,
    expirationTime: null,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }

  const pushPayload = await buildPushPayload(
    { data: JSON.stringify(payload), options: { ttl: 60 * 60 * 24 } },
    pushSubscription,
    vapid,
  )

  const res = await fetch(subscription.endpoint, pushPayload)
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    console.warn(`[push] ${res.status} ${subscription.endpoint.slice(0, 80)} ${bodyText.slice(0, 200)}`)
  }
  return res.status
}

/** Deletes a stale push subscription row by endpoint. */
export async function deleteStaleSubscription(endpoint: string, env: Env): Promise<void> {
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: 'DELETE', headers: serviceHeaders(env) },
  )
}

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

/** Web Push to every browser subscription of a user. Cleans up stale endpoints on 404/410. */
async function dispatchWebPush(userId: string, payload: PushPayload, env: Env): Promise<void> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
    { headers: serviceHeaders(env) },
  )

  if (!res.ok)
    return

  const subscriptions = (await res.json()) as PushSubscriptionRow[]

  await Promise.all(
    subscriptions.map(async (sub) => {
      const status = await sendPushNotification(sub, payload, env)
      if (status === 404 || status === 410) {
        await deleteStaleSubscription(sub.endpoint, env)
      }
    }),
  )
}

/** The user's unread inbox entries, the app icon's badge; undefined when the count fails. */
async function unreadCount(userId: string, env: Env): Promise<number | undefined> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/notifications?recipient_id=eq.${encodeURIComponent(userId)}&read_at=is.null&select=id`,
    { method: 'HEAD', headers: { ...serviceHeaders(env), Prefer: 'count=exact' } },
  ).catch(() => null)
  const total = res?.ok ? Number(res.headers.get('content-range')?.split('/')[1]) : Number.NaN
  return Number.isFinite(total) ? total : undefined
}

/**
 * Push to every native device of a user: APNs for iOS, FCM for Android (change:
 * add-native-backend). A platform without credentials is skipped; a token the provider reports
 * gone loses its row.
 */
async function dispatchNativePush(userId: string, payload: PushPayload, env: Env): Promise<void> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/device_push_tokens?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,platform,token,app_id,apns_environment`,
    { headers: serviceHeaders(env) },
  )
  if (!res.ok)
    return
  const rows = (await res.json()) as DeviceTokenRow[]
  const senders: Record<DeviceTokenRow['platform'], [boolean, typeof sendApns]> = {
    ios: [apnsConfigured(env), sendApns],
    android: [fcmConfigured(env), sendFcm],
  }
  const skipped = new Set<string>()
  const badge = rows.some(row => row.platform === 'ios') && apnsConfigured(env)
    ? await unreadCount(userId, env)
    : undefined

  await Promise.all(
    rows.map(async (row) => {
      const [configured, send] = senders[row.platform] ?? [false, sendApns]
      if (!configured) {
        skipped.add(row.platform)
        return
      }
      const outcome: SendOutcome = await send(row, { ...payload, badge }, env)
      if (outcome === 'stale') {
        await fetch(`${env.SUPABASE_URL}/rest/v1/device_push_tokens?id=eq.${encodeURIComponent(row.id)}`, {
          method: 'DELETE',
          headers: serviceHeaders(env),
        })
      }
    }),
  )
  for (const platform of skipped)
    console.warn(`[push] ${platform} credentials not configured; skipped`)
}

/** Dispatches push to all of a user's browsers and native devices. */
export async function dispatchPushToUser(
  userId: string,
  payload: PushPayload,
  env: Env,
): Promise<void> {
  const results = await Promise.allSettled([
    dispatchWebPush(userId, payload, env),
    dispatchNativePush(userId, payload, env),
  ])
  for (const r of results) {
    if (r.status === 'rejected')
      console.error('[push] channel failed:', r.reason)
  }
}
