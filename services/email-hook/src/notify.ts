import type { Env } from './config'
import { jsonResponse, resolveLocale, secretMatches } from './config'
import { sendFriendNotificationEmail, sendTourLinkDeletedEmail, sendTourNotificationEmail } from './email'
import { dispatchPushToUser } from './push'

/**
 * One `public.notifications` row, as POSTed by the DB dispatch trigger (pg_net). The
 * database already decided WHO is notified about WHAT (change: notification-inbox, D3);
 * the Worker only decides HOW — channels, mutes, locale, copy (D5).
 */
export interface NotificationRow {
  id: string
  recipient_id: string
  type: NotificationType
  action: string
  actor_name: string | null
  tour_name: string | null
  ref?: { friend_ids?: string[] } | null
}

// `release_notes` never reaches the Worker: the dispatch trigger skips it (D8).
type NotificationType
  = | 'friend_requests'
    | 'tour_updates'
    | 'tour_interest'
    | 'tour_suggestions'
    | 'availability'
    | 'tour_reminders'

interface UserProfileRow {
  notif_email_enabled: boolean
  notif_muted_types: string[]
  locale: string | null
}

const DEFAULT_APP_URL = 'https://test.tourenbuddy.ch'

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

async function fetchUserProfile(userId: string, env: Env): Promise<UserProfileRow | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_profile?id=eq.${encodeURIComponent(userId)}&select=notif_email_enabled,notif_muted_types,locale`,
    { headers: serviceHeaders(env) },
  )
  if (!res.ok)
    return null
  const rows = (await res.json()) as UserProfileRow[]
  return rows[0] ?? null
}

async function fetchUserEmail(userId: string, env: Env): Promise<string | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: serviceHeaders(env),
  })
  if (!res.ok)
    return null
  const user = (await res.json()) as { email?: string }
  return user.email ?? null
}

/** Display name of the summary's first friend; null if the profile is gone or nameless. */
async function fetchDisplayName(userId: string | undefined, env: Env): Promise<string | null> {
  if (!userId)
    return null
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_profile?id=eq.${encodeURIComponent(userId)}&select=first_name,last_name`,
    { headers: serviceHeaders(env) },
  )
  if (!res.ok)
    return null
  const rows = (await res.json()) as { first_name: string | null, last_name: string | null }[]
  return [rows[0]?.first_name, rows[0]?.last_name].filter(Boolean).join(' ') || null
}

// ── Push copy, keyed by (type, action) ───────────────────────────────────────

function friendPushCopy(action: string, locale: 'en' | 'de', actor: string): { title: string, body: string } {
  const received = action === 'received'
  if (locale === 'de') {
    return received
      ? { title: 'Neue Freundschaftsanfrage', body: `${actor} möchte sich mit dir verbinden.` }
      : { title: 'Antwort auf Freundschaftsanfrage', body: `${actor} hat auf deine Anfrage geantwortet.` }
  }
  return received
    ? { title: 'New friend request', body: `${actor} wants to connect.` }
    : { title: 'Friend request update', body: `${actor} responded to your request.` }
}

// Actor-less job entries (D10): the weekly availability summary and the 5-day reminder.
function availabilityPushCopy(locale: 'en' | 'de', friend: string, more: number): { title: string, body: string } {
  if (locale === 'de') {
    return {
      title: 'Freunde haben diese Woche Zeit',
      body: more > 0
        ? `${friend} und ${more} weitere haben diese Woche Zeit, wenn du Zeit hast.`
        : `${friend} hat diese Woche Zeit, wenn du Zeit hast.`,
    }
  }
  return {
    title: 'Friends free this week',
    body: more > 0
      ? `${friend} and ${more} more are free this week when you are.`
      : `${friend} is free this week when you are.`,
  }
}

function reminderPushCopy(locale: 'en' | 'de', tourName: string): { title: string, body: string } {
  return locale === 'de'
    ? { title: 'Tour in 5 Tagen', body: `«${tourName}» ist in 5 Tagen.` }
    : { title: 'Tour in 5 days', body: `“${tourName}” is in 5 days.` }
}

function tourPushTitle(type: NotificationType, action: string, locale: 'en' | 'de'): string {
  if (type === 'tour_suggestions') {
    if (locale === 'de') {
      return action === 'suggestion_submitted'
        ? 'Änderungsvorschlag erhalten'
        : action === 'suggestion_revised'
          ? 'Änderungsvorschlag überarbeitet'
          : 'Dein Vorschlag wurde entschieden'
    }
    return action === 'suggestion_submitted'
      ? 'Changes suggested for your tour'
      : action === 'suggestion_revised'
        ? 'Suggested changes revised'
        : 'Your suggestions were decided'
  }
  if (type === 'tour_interest') {
    if (locale === 'de') {
      switch (action) {
        case 'collision': return 'Gleiche Tour geplant'
        case 'backfill': return 'Gemeinsame Touren geplant'
        case 'link_created': return 'Verknüpfungsanfrage erhalten'
        case 'link_declined': return 'Verknüpfung abgelehnt'
        case 'group_joined': return 'Neue Tour in deiner Verknüpfung'
        case 'group_evicted_external': return 'Tour aus Verknüpfung entfernt'
        case 'group_dissolved': return 'Verknüpfung aufgelöst'
        default: return 'Update zu deiner Tour'
      }
    }
    switch (action) {
      case 'collision': return 'Same tour planned'
      case 'backfill': return 'Shared tours planned'
      case 'link_created': return 'Link request received'
      case 'link_declined': return 'Link request declined'
      case 'group_joined': return 'New tour in your link'
      case 'group_evicted_external': return 'Tour removed from link'
      case 'group_dissolved': return 'Tour link dissolved'
      default: return 'Update on your tour'
    }
  }
  if (locale === 'de') {
    return action === 'created'
      ? 'Neue geteilte Tour'
      : action === 'deleted'
        ? 'Geteilte Tour entfernt'
        : 'Geteilte Tour aktualisiert'
  }
  return action === 'created'
    ? 'New shared tour'
    : action === 'deleted'
      ? 'Shared tour removed'
      : 'Shared tour updated'
}

function tourPushBody(
  type: NotificationType,
  action: string,
  locale: 'en' | 'de',
  actorName: string,
  tourName: string,
): string {
  const tour = tourName || (locale === 'de' ? 'eine Tour' : 'a tour')
  if (type === 'tour_suggestions') {
    if (action === 'suggestion_submitted') {
      return locale === 'de'
        ? `${actorName} schlägt Änderungen an «${tour}» vor.`
        : `${actorName} suggested changes to “${tour}”.`
    }
    if (action === 'suggestion_revised') {
      return locale === 'de'
        ? `${actorName} hat die Vorschläge für «${tour}» überarbeitet.`
        : `${actorName} revised their suggestions for “${tour}”.`
    }
    // No accepted/declined tally: "3 / 1" reads as a score, not an outcome. The batch's
    // per-field verdicts are one tap away in the tour's suggestion history.
    return locale === 'de'
      ? `${actorName} hat über deine Vorschläge für «${tour}» entschieden.`
      : `${actorName} decided on your suggestions for “${tour}”.`
  }
  if (type === 'tour_interest') {
    if (locale === 'de') {
      switch (action) {
        case 'collision': return `${actorName} hat dieselbe Tour wie «${tour}» geplant.`
        case 'backfill': return `${actorName} hat dieselben Touren wie du geplant. Schau sie dir auf TourenBuddy an.`
        case 'link_created': return `${actorName} möchte «${tour}» mit dir verknüpfen.`
        case 'link_declined': return `${actorName} hat deine Verknüpfungsanfrage für «${tour}» abgelehnt.`
        case 'group_joined': return `${actorName} hat eine Tour zur Verknüpfung mit «${tour}» hinzugefügt.`
        case 'group_evicted_external': return `Eine Tour wurde aus der Verknüpfung mit «${tour}» entfernt.`
        case 'group_dissolved': return `Die Verknüpfung für «${tour}» wurde aufgelöst.`
        default: return `${actorName} hat «${tour}» aktualisiert.`
      }
    }
    switch (action) {
      case 'collision': return `${actorName} planned the same tour as “${tour}”.`
      case 'backfill': return `${actorName} planned the same tours as you. Check them out on TourenBuddy.`
      case 'link_created': return `${actorName} wants to link “${tour}” with their tour.`
      case 'link_declined': return `${actorName} declined your link request for “${tour}”.`
      case 'group_joined': return `${actorName} added a tour to your link for “${tour}”.`
      case 'group_evicted_external': return `A tour was removed from the link for “${tour}”.`
      case 'group_dissolved': return `The link for “${tour}” was dissolved.`
      default: return `${actorName} updated “${tour}”.`
    }
  }
  if (locale === 'de') {
    return action === 'created'
      ? `${actorName} hat «${tour}» mit dir geteilt.`
      : action === 'deleted'
        ? `${actorName} hat «${tour}» entfernt.`
        : `${actorName} hat «${tour}» aktualisiert.`
  }
  return action === 'created'
    ? `${actorName} shared “${tour}” with you.`
    : action === 'deleted'
      ? `${actorName} removed “${tour}”.`
      : `${actorName} updated “${tour}”.`
}

function sendEmail(row: NotificationRow, toEmail: string, locale: string | null, actorName: string, appUrl: string, env: Env): Promise<void> {
  const tourName = row.tour_name ?? ''
  // Job entries ride the generic tour_updates template, which branches on these actions.
  if (row.type === 'availability' || row.type === 'tour_reminders') {
    const action = row.type === 'availability' ? 'availability_weekly' : 'tour_reminder'
    const moreCount = Math.max((row.ref?.friend_ids?.length ?? 1) - 1, 0)
    return sendTourNotificationEmail(
      { toEmail, locale, type: 'tour_updates', action, actorName, tourName, appUrl, moreCount },
      env,
    )
  }
  if (row.type === 'friend_requests') {
    return sendFriendNotificationEmail(
      { toEmail, locale, actorName, appUrl, event: row.action === 'received' ? 'received' : 'responded' },
      env,
    )
  }
  // Group dissolution keeps its dedicated template so its copy can diverge.
  if (row.action === 'group_dissolved')
    return sendTourLinkDeletedEmail({ toEmail, locale, actorName, tourName, appUrl }, env)
  // The Brevo templates branch on these action strings; only the digest was named
  // differently there, so it is mapped back rather than editing live templates.
  const action = row.action === 'backfill' ? 'backfill_digest' : row.action
  return sendTourNotificationEmail(
    { toEmail, locale, type: row.type, action, actorName, tourName, appUrl },
    env,
  )
}

/**
 * POST /notify/event — called by the DB dispatch trigger, never by clients. Push goes to
 * every registered device of the recipient: rows exist ⇔ push enabled on that device
 * (#148), so there is no account-wide push flag to check. Mutes and the email flag
 * govern interruption only; the inbox row already exists either way.
 */
export async function handleEvent(request: Request, env: Env): Promise<Response> {
  if (!env.NOTIFY_WEBHOOK_SECRET)
    return jsonResponse(500, { error: 'missing_configuration' })
  if (!secretMatches(request.headers.get('x-notify-secret') ?? '', env.NOTIFY_WEBHOOK_SECRET))
    return jsonResponse(401, { error: 'unauthorized' })

  let row: NotificationRow
  try {
    row = (await request.json()) as NotificationRow
  }
  catch {
    return jsonResponse(400, { error: 'invalid_json' })
  }
  if (!row?.id || !row.recipient_id || !row.type || !row.action)
    return jsonResponse(400, { error: 'missing_fields' })

  const [profile, email] = await Promise.all([
    fetchUserProfile(row.recipient_id, env),
    fetchUserEmail(row.recipient_id, env),
  ])
  if (!profile)
    return jsonResponse(200, { skipped: 'no_profile' })
  if (profile.notif_muted_types.includes(row.type))
    return jsonResponse(200, { skipped: 'muted' })

  const locale = resolveLocale(profile.locale)
  const friendIds = row.ref?.friend_ids ?? []
  // The summary has no actor: its "actor" in the copy is the first friend, named now (D2).
  const actorName = row.type === 'availability'
    ? (await fetchDisplayName(friendIds[0], env)) || (locale === 'de' ? 'Ein Freund' : 'A friend')
    : row.actor_name || 'Someone'
  // The app resolves the entry's own deep link and marks it read (one place for routing).
  const url = `${env.APP_URL || DEFAULT_APP_URL}/?notification=${encodeURIComponent(row.id)}`
  const copy = row.type === 'friend_requests'
    ? friendPushCopy(row.action, locale, actorName)
    : row.type === 'availability'
      ? availabilityPushCopy(locale, actorName, Math.max(friendIds.length - 1, 0))
      : row.type === 'tour_reminders'
        ? reminderPushCopy(locale, row.tour_name ?? '')
        : {
            title: tourPushTitle(row.type, row.action, locale),
            body: tourPushBody(row.type, row.action, locale, actorName, row.tour_name ?? ''),
          }

  const tasks: Promise<void>[] = [dispatchPushToUser(row.recipient_id, { ...copy, url }, env)]
  if (profile.notif_email_enabled && email)
    tasks.push(sendEmail(row, email, profile.locale, actorName, url, env))

  const results = await Promise.allSettled(tasks)
  for (const r of results) {
    if (r.status === 'rejected')
      console.error(`[notify/event] channel failed for ${row.id}:`, r.reason)
  }
  return jsonResponse(200)
}
