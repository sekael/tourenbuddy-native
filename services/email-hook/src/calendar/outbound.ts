import type { Env } from '../config'
import { rest } from './sync'
import { addDays } from './zurich'

export interface FeedTour {
  id: string
  name: string
  planned_date: string
  end_date: string | null
}

const enc = new TextEncoder()

/** RFC 5545 §3.3.11 TEXT escaping. Backslash first, or the others get double-escaped. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** RFC 5545 §3.1: fold at 75 octets, never inside a multi-byte UTF-8 character. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    // continuation lines start with a space, which counts toward their 75
    if (bytes + n > 75) {
      out.push(cur)
      cur = ' '
      bytes = 1
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n')
}

const compact = (dateKey: string) => dateKey.replaceAll('-', '')

export function renderTourFeed(tours: FeedTour[], now = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tourenbuddy//Tours//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Tourenbuddy',
  ]
  for (const t of tours) {
    if (!t.planned_date)
      continue
    lines.push(
      'BEGIN:VEVENT',
      `UID:tour-${t.id}@tourenbuddy`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(t.planned_date)}`,
      // DTEND is exclusive for DATE values: a one-day tour ends the day after it starts.
      `DTEND;VALUE=DATE:${compact(addDays(t.end_date ?? t.planned_date, 1))}`,
      `SUMMARY:${escapeText(t.name)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}

const TOKEN_PATH = /^\/calendar\/([0-9a-f-]{36})\.ics$/i

/** `GET /calendar/:token.ics` — the user's OWN planned tours, rendered live (design D9). */
export async function handleTourFeed(pathname: string, env: Env): Promise<Response> {
  // One bare 404 for malformed, unknown, revoked or never-issued tokens alike.
  const notFound = new Response('Not found', { status: 404 })
  const token = TOKEN_PATH.exec(pathname)?.[1]
  if (!token)
    return notFound

  const settings = await rest(env, `user_calendar_settings?feed_token=eq.${token}&select=user_id`)
  const [owner] = settings.ok ? await settings.json() as { user_id: string }[] : []
  if (!owner)
    return notFound

  // No tour_link join: a linked tour is already the user's own row, and another user's tour
  // must never reach a subscribing provider that stores what it fetches.
  const res = await rest(env, `tours?user_id=eq.${owner.user_id}&planned_date=not.is.null&select=id,name,planned_date,end_date&order=planned_date`)
  if (!res.ok)
    throw new Error(`tours ${res.status}`)

  return new Response(renderTourFeed(await res.json() as FeedTour[]), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=900',
    },
  })
}
