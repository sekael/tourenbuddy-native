import ICAL from 'ical.js'
import { zurichWallTime } from './zurich'

export interface Occurrence { start: Date, end: Date }

// A pathological RRULE (FREQ=MINUTELY since 2010) would burn the Worker's CPU budget.
// ponytail: flat cap, fails the feed closed; anchor the iterator near `from` if real feeds hit it.
const MAX_ITERATIONS = 20_000

export class IcsParseError extends Error {
  constructor(readonly code: 'unparseable' | 'too_complex') {
    super(code)
  }
}

/** Absolute instant of an ICAL time. Floating / unknown-TZID times are read as Zurich wall time. */
function toDate(t: ICAL.Time): Date {
  const tzid = t.zone?.tzid
  if (!tzid || tzid === 'floating')
    return zurichWallTime(t.toString().slice(0, 10), `${t.hour}:${t.minute}:${t.second}`)
  return t.toJSDate()
}

function isSkipped(event: ICAL.Event): boolean {
  return event.startDate.isDate // all-day: no time to intersect with the core window (D4)
    || event.uid?.endsWith('@tourenbuddy') // our own outbound feed echoed back (D7)
    || event.component.getFirstPropertyValue('status') === 'CANCELLED'
    || event.component.getFirstPropertyValue('transp') === 'TRANSPARENT' // "show as free"
}

function expand(body: string, from: Date, to: Date): Occurrence[] {
  const root = new ICAL.Component(ICAL.parse(body) as unknown[])
  if (root.name !== 'vcalendar')
    throw new IcsParseError('unparseable')

  for (const tz of root.getAllSubcomponents('vtimezone'))
    ICAL.TimezoneService.register(tz)

  // Exceptions (RECURRENCE-ID) attach to their master so the iterator yields the moved time.
  const masters = new Map<string, ICAL.Event>()
  const exceptions: ICAL.Event[] = []
  for (const c of root.getAllSubcomponents('vevent')) {
    const e = new ICAL.Event(c)
    if (e.isRecurrenceException())
      exceptions.push(e)
    else masters.set(e.uid, e)
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid)
    if (master)
      master.relateException(ex)
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex)
  }

  const out: Occurrence[] = []
  const push = (start: Date, end: Date) => {
    if (start < to && end > from)
      out.push({ start, end })
  }

  for (const event of masters.values()) {
    if (isSkipped(event))
      continue
    if (!event.isRecurring()) {
      push(toDate(event.startDate), toDate(event.endDate))
      continue
    }
    const it = event.iterator()
    let n = 0
    for (let next = it.next(); next; next = it.next()) {
      if (++n > MAX_ITERATIONS)
        throw new IcsParseError('too_complex')
      // Stop on the slot, not the occurrence: slots arrive in order, moved starts do not. An
      // exception moved past `to` would otherwise drop every later occurrence and free days.
      if (toDate(next) >= to)
        break
      const occ = event.getOccurrenceDetails(next)
      if (occ.item !== event && isSkipped(occ.item))
        continue
      push(toDate(occ.startDate), toDate(occ.endDate))
    }
    // Slots past `to` are never visited, yet an exception can move one of them into range.
    for (const ex of Object.values(event.exceptions)) {
      if (toDate(ex.recurrenceId) >= to && !isSkipped(ex))
        push(toDate(ex.startDate), toDate(ex.endDate))
    }
  }
  return out
}

/**
 * Timed occurrences overlapping [from, to), recurrences expanded. Throws `IcsParseError` on a
 * body it cannot read — an empty result must mean "no events", never "could not read" (D5).
 */
export function parseIcs(body: string, from: Date, to: Date): Occurrence[] {
  try {
    return expand(body, from, to)
  }
  catch (err) {
    // ical.js reads values lazily, so a malformed VEVENT (no DTSTART, garbage date) throws a raw
    // Error mid-walk. Same failure as a garbled body, and its message can quote the feed (D8).
    throw err instanceof IcsParseError ? err : new IcsParseError('unparseable')
  }
}
