import type { Env } from './config'
import { jsonResponse, secretMatches } from './config'

/**
 * POST /moderation/report (change: add-native-backend, design D6): the database hands every new
 * or repeated abuse report here; the operator gets an email. Nothing happens to either account.
 */
interface ReportRow {
  id: number | string
  reporter_user_id: string | null
  reported_user_id: string | null
  reason: string | null
  created_at: string
}

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

async function describeUser(userId: string | null, env: Env): Promise<string> {
  if (!userId)
    return '(deleted account)'
  const [profile, user] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_profile?id=eq.${encodeURIComponent(userId)}&select=first_name,last_name`,
      { headers: serviceHeaders(env) },
    ).then(r => (r.ok ? r.json() : [])).catch(() => []) as Promise<{ first_name: string | null, last_name: string | null }[]>,
    fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: serviceHeaders(env) })
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({})) as Promise<{ email?: string }>,
  ])
  const name = [profile[0]?.first_name, profile[0]?.last_name].filter(Boolean).join(' ') || '(no name)'
  return `${name} <${user.email ?? 'no email'}> (${userId})`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}

export async function handleModerationReport(request: Request, env: Env): Promise<Response> {
  if (!env.NOTIFY_WEBHOOK_SECRET)
    return jsonResponse(500, { error: 'missing_configuration' })
  if (!secretMatches(request.headers.get('x-notify-secret') ?? '', env.NOTIFY_WEBHOOK_SECRET))
    return jsonResponse(401, { error: 'unauthorized' })

  let report: ReportRow
  try {
    report = (await request.json()) as ReportRow
  }
  catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }
  if (!report?.id)
    return jsonResponse(400, { error: 'missing_fields' })
  if (!env.MODERATION_EMAIL || !env.BREVO_API_KEY)
    return jsonResponse(200, { skipped: 'no_moderation_email' })

  const [reporter, reported] = await Promise.all([
    describeUser(report.reporter_user_id, env),
    describeUser(report.reported_user_id, env),
  ])
  const rows: [string, string][] = [
    ['Report', String(report.id)],
    ['Reported user', reported],
    ['Reported by', reporter],
    ['Reason', report.reason?.trim() || '(none given)'],
    ['At', report.created_at],
  ]
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: env.MODERATION_EMAIL, name: 'TourenBuddy moderation' },
      to: [{ email: env.MODERATION_EMAIL }],
      subject: `[TourenBuddy] Abuse report ${report.id}`,
      htmlContent: `<p>A user was reported. Respond within 24 hours (docs/moderation.md).</p><table>${
        rows.map(([k, v]) => `<tr><th align="left">${k}</th><td>${escapeHtml(v)}</td></tr>`).join('')
      }</table>`,
    }),
  })
  if (!res.ok) {
    console.error(`[moderation] Brevo ${res.status}: ${await res.text().catch(() => '')}`)
    return jsonResponse(502, { error: 'email_delivery_failed' })
  }
  return jsonResponse(200)
}
