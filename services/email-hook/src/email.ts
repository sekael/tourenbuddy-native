import type { Env } from './config'
import { resolveLocale } from './config'

export interface FriendNotificationEmailParams {
  toEmail: string
  locale: string | null | undefined
  actorName: string
  appUrl: string
  event: 'received' | 'responded'
}

/** Sends a localized friend-request notification email via Brevo. Logs on failure. */
export async function sendFriendNotificationEmail(
  params: FriendNotificationEmailParams,
  env: Env,
): Promise<void> {
  const locale = resolveLocale(params.locale)

  let templateId: number
  if (params.event === 'received') {
    templateId = Number(locale === 'de' ? env.BREVO_TEMPLATE_FRIEND_RECEIVED_DE : env.BREVO_TEMPLATE_FRIEND_RECEIVED_EN)
  }
  else {
    templateId = Number(locale === 'de' ? env.BREVO_TEMPLATE_FRIEND_RESPONDED_DE : env.BREVO_TEMPLATE_FRIEND_RESPONDED_EN)
  }

  if (!templateId || Number.isNaN(templateId)) {
    console.error('Missing Brevo template ID for friend notification', { event: params.event, locale })
    return
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [{ email: params.toEmail }],
      templateId,
      params: {
        actorName: params.actorName,
        appUrl: params.appUrl,
      },
    }),
  })

  if (!res.ok) {
    console.error(`Brevo error ${res.status} for friend notification`, await res.text())
  }
}

export interface TourNotificationEmailParams {
  toEmail: string
  locale: string | null | undefined
  type: 'tour_updates' | 'tour_interest' | 'tour_suggestions'
  /**
   * 'created' | 'updated' | 'deleted' for tour_updates; 'interest' for tour_interest;
   * 'suggestion_submitted' | 'suggestion_revised' | 'suggestion_resolved' for tour_suggestions;
   * 'availability_weekly' | 'tour_reminder' for the job entries (sent as tour_updates).
   */
  action: string
  actorName: string
  tourName: string
  appUrl: string
  /** Further friends in an availability summary beyond `actorName`. */
  moreCount?: number
}

/**
 * Sends a localized shared-tour notification email via Brevo. One generic template
 * per type per locale, parameterized by action + actor + tour. Logs on failure.
 */
export async function sendTourNotificationEmail(
  params: TourNotificationEmailParams,
  env: Env,
): Promise<void> {
  const locale = resolveLocale(params.locale)

  // ponytail: tour_suggestions reuses the generic tour_updates template, parameterized by
  // `action` like every other case. A dedicated template would need two new Brevo ids as
  // Worker secrets, and a missing one degrades to NO email at all (see the guard below) —
  // worse than reusing copy that already reads correctly for "your tour changed".
  const templateId
    = params.type === 'tour_interest'
      ? Number(locale === 'de' ? env.BREVO_TEMPLATE_TOUR_INTEREST_DE : env.BREVO_TEMPLATE_TOUR_INTEREST_EN)
      : Number(locale === 'de' ? env.BREVO_TEMPLATE_TOUR_UPDATES_DE : env.BREVO_TEMPLATE_TOUR_UPDATES_EN)

  if (!templateId || Number.isNaN(templateId)) {
    console.error('Missing Brevo template ID for tour notification', { type: params.type, locale })
    return
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [{ email: params.toEmail }],
      templateId,
      params: {
        action: params.action,
        actorName: params.actorName,
        tourName: params.tourName,
        appUrl: params.appUrl,
        moreCount: params.moreCount ?? 0,
      },
    }),
  })

  if (!res.ok) {
    console.error(`Brevo error ${res.status} for tour notification`, await res.text())
  }
}

export interface TourLinkDeletedEmailParams {
  toEmail: string
  locale: string | null | undefined
  actorName: string
  tourName: string
  appUrl: string
}

/**
 * Sends a localized tour-link-dissolution email via Brevo, using a dedicated
 * template (separate from the generic tour_interest template). Logs on failure.
 */
export async function sendTourLinkDeletedEmail(
  params: TourLinkDeletedEmailParams,
  env: Env,
): Promise<void> {
  const locale = resolveLocale(params.locale)

  const templateId = Number(
    locale === 'de' ? env.BREVO_TEMPLATE_TOUR_LINK_DELETED_DE : env.BREVO_TEMPLATE_TOUR_LINK_DELETED_EN,
  )

  if (!templateId || Number.isNaN(templateId)) {
    console.error('Missing Brevo template ID for tour-link-deleted notification', { locale })
    return
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [{ email: params.toEmail }],
      templateId,
      params: {
        actorName: params.actorName,
        tourName: params.tourName,
        appUrl: params.appUrl,
      },
    }),
  })

  if (!res.ok) {
    console.error(`Brevo error ${res.status} for tour-link-deleted notification`, await res.text())
  }
}
