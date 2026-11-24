import type { Env } from './config'
import { Webhook } from 'standardwebhooks'
import { handleAccountDelete } from './account'
import { verifySupabaseJwt } from './auth'
import { handleTourFeed } from './calendar/outbound'
import { purgePastAvailability, syncAllUsers, syncUser } from './calendar/sync'
import { corsHeaders, jsonResponse, resolveLocale } from './config'
import { handleModerationReport } from './moderation'
import { handleEvent } from './notify'

interface SupabaseHookPayload {
  user: {
    email: string
    user_metadata?: {
      locale?: string
    }
  }
  email_data: {
    token: string
  }
}

async function handleEmailHook(request: Request, env: Env): Promise<Response> {
  if (
    !env.BREVO_API_KEY
    || !env.SEND_EMAIL_HOOK_SECRET
    || !env.BREVO_TEMPLATE_EN
    || !env.BREVO_TEMPLATE_DE
  ) {
    return jsonResponse(500, { error: 'missing_configuration' })
  }

  const webhookId = request.headers.get('webhook-id') ?? ''
  const webhookTimestamp = request.headers.get('webhook-timestamp') ?? ''
  const webhookSignature = request.headers.get('webhook-signature') ?? ''
  const body = await request.text()

  const wh = new Webhook(env.SEND_EMAIL_HOOK_SECRET)
  try {
    wh.verify(body, {
      'webhook-id': webhookId,
      'webhook-timestamp': webhookTimestamp,
      'webhook-signature': webhookSignature,
    })
  }
  catch {
    return jsonResponse(401, { error: 'invalid_signature' })
  }

  let payload: SupabaseHookPayload
  try {
    payload = JSON.parse(body) as SupabaseHookPayload
  }
  catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }

  const { user, email_data } = payload

  if (!email_data.token) {
    return jsonResponse(400, { error: 'missing_otp_token' })
  }

  const locale = resolveLocale(user.user_metadata?.locale)
  const templateId = Number(locale === 'de' ? env.BREVO_TEMPLATE_DE : env.BREVO_TEMPLATE_EN)

  const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [{ email: user.email }],
      templateId,
      params: {
        otp: email_data.token,
        email: user.email,
      },
    }),
  })

  if (!brevoResponse.ok) {
    const errorText = await brevoResponse.text()
    console.error(`Brevo error ${brevoResponse.status}: ${errorText}`)
    return jsonResponse(502, { error: 'email_delivery_failed' })
  }

  return jsonResponse(200)
}

function withCors(response: Response, request: Request): Response {
  const headers = corsHeaders(request)
  if (Object.keys(headers).length === 0)
    return response
  const merged = new Headers(response.headers)
  for (const [k, v] of Object.entries(headers)) merged.set(k, v)
  return new Response(response.body, { status: response.status, headers: merged })
}

async function handleCalendarSync(request: Request, env: Env): Promise<Response> {
  const userId = await verifySupabaseJwt(request, env)
  if (!userId)
    return jsonResponse(401, { error: 'unauthorized' })
  // Scoped to the verified caller only — never a user id from the body. Unconditional (D6): the
  // caller just changed something no feed can report, so a 304 must not skip the recompute.
  return jsonResponse(200, { result: await syncUser(env, userId, { conditional: false }) })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    const url = new URL(request.url)

    // Subscribed by calendar apps server-side: GET, no CORS, no JSON errors.
    if (request.method === 'GET' && url.pathname.startsWith('/calendar/')) {
      try {
        return await handleTourFeed(url.pathname, env)
      }
      catch (err) {
        console.error(`[calendar] tour feed failed: ${(err as Error).message}`)
        return new Response('Internal error', { status: 500 })
      }
    }

    if (request.method !== 'POST') {
      return withCors(jsonResponse(405, { error: 'method_not_allowed' }), request)
    }

    try {
      if (url.pathname === '/calendar/sync') {
        return withCors(await handleCalendarSync(request, env), request)
      }

      if (url.pathname === '/account/delete') {
        return withCors(await handleAccountDelete(request, env), request)
      }

      // Server-to-server from the DB dispatch trigger (pg_net): no CORS.
      if (url.pathname === '/notify/event') {
        return await handleEvent(request, env)
      }

      // Server-to-server from the abuse report trigger (pg_net): no CORS.
      if (url.pathname === '/moderation/report') {
        return await handleModerationReport(request, env)
      }

      // Default: Supabase Auth email hook (verifies signature internally, no CORS — server-to-server)
      return await handleEmailHook(request, env)
    }
    catch (err) {
      console.error(`[worker] uncaught error on ${url.pathname}:`, err)
      return withCors(
        jsonResponse(500, { error: 'internal_error', message: (err as Error).message }),
        request,
      )
    }
  },

  // Cron (wrangler.toml [triggers]): 6-hourly calendar sync for every user with a feed.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.all([purgePastAvailability(env), syncAllUsers(env)]))
  },
}
