export interface Env {
  // Existing OTP email secrets
  BREVO_API_KEY: string
  SEND_EMAIL_HOOK_SECRET: string
  BREVO_TEMPLATE_EN: string
  BREVO_TEMPLATE_DE: string

  // Notification secrets
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  VAPID_SUBJECT: string
  BREVO_TEMPLATE_FRIEND_RECEIVED_EN: string
  BREVO_TEMPLATE_FRIEND_RECEIVED_DE: string
  BREVO_TEMPLATE_FRIEND_RESPONDED_EN: string
  BREVO_TEMPLATE_FRIEND_RESPONDED_DE: string
  // Shared-tour notifications: one generic template per type per locale.
  BREVO_TEMPLATE_TOUR_UPDATES_EN: string
  BREVO_TEMPLATE_TOUR_UPDATES_DE: string
  BREVO_TEMPLATE_TOUR_INTEREST_EN: string
  BREVO_TEMPLATE_TOUR_INTEREST_DE: string
  // Tour-link group dissolution: dedicated template per locale (kept out of the
  // generic tour_interest template so its copy can diverge).
  BREVO_TEMPLATE_TOUR_LINK_DELETED_EN: string
  BREVO_TEMPLATE_TOUR_LINK_DELETED_DE: string

  // Shared secret for POST /notify/event; same value as the Vault `notify_webhook_secret`.
  NOTIFY_WEBHOOK_SECRET: string

  // Native push (change: add-native-backend). Unset = that platform is skipped.
  // APNs token auth: the .p8 key's id and contents, and the Apple team id.
  APNS_KEY_ID?: string
  APNS_TEAM_ID?: string
  APNS_PRIVATE_KEY?: string
  // FCM HTTP v1: the Firebase service account JSON (client_email, private_key, project_id).
  FCM_SERVICE_ACCOUNT?: string

  // Abuse report alerts go here (and are sent from it). Unset = alerts skipped.
  MODERATION_EMAIL?: string

  // Optional: app URL used for push deep-links and email links.
  // Defaults to https://test.tourenbuddy.ch if unset.
  // Override to https://tourenbuddy.ch (or www variant) when prod domain goes live.
  APP_URL?: string
}

export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  // Expo's web dev server (the native repo's web app).
  'http://localhost:8081',
  'https://test.tourenbuddy.ch',
  'https://tourenbuddy.ch',
  'https://www.tourenbuddy.ch',
  'https://tourenbuddy-native.pages.dev',
])

// Pages previews: the PWA's project and the native repo's web project.
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.(?:touringbuddy|tourenbuddy-native)\.pages\.dev$/

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? ''
  // No Origin (native apps, servers): no CORS headers; the JWT alone authorizes.
  const allowOrigin = ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin) ? origin : ''
  if (!allowOrigin)
    return {}
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

export function jsonResponse(
  status: number,
  body: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  })
}

export function resolveLocale(locale: string | null | undefined): 'en' | 'de' {
  return locale === 'de' || locale === 'de-CH' ? 'de' : 'en'
}

/** Constant-time string compare, so a secret can't be recovered by timing the 401. */
export function secretMatches(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++)
    diff |= (a[i] ?? 0) ^ b[i]
  return diff === 0
}
