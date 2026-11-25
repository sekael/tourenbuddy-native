// Europe/Zurich wall-clock helpers. The Worker runs in UTC with no TZ database
// beyond Intl, and hand-rolled +01:00/+02:00 offsets are wrong twice a year.

const TZ = 'Europe/Zurich'

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function wallParts(instantMs: number): Record<string, string> {
  return Object.fromEntries(fmt.formatToParts(new Date(instantMs)).map(p => [p.type, p.value]))
}

/** Zurich offset from UTC (ms) at the given instant. */
function offsetMs(instantMs: number): number {
  const s = Math.floor(instantMs / 1000) * 1000
  const p = wallParts(s)
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - s
}

/** `YYYY-MM-DD` of the Zurich local day containing `date`. */
export function zurichDateKey(date: Date): string {
  const p = wallParts(date.getTime())
  return `${p.year}-${p.month}-${p.day}`
}

/** The instant at which Zurich clocks show `dateKey` at `time` (`HH:MM[:SS]`). */
export function zurichWallTime(dateKey: string, time = '00:00'): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [h, mi, s = 0] = time.split(':').map(Number)
  const asUtc = Date.UTC(y, m - 1, d, h, mi, s)
  // Second pass corrects a first guess that landed on the other side of a DST switch.
  const first = asUtc - offsetMs(asUtc)
  return new Date(asUtc - offsetMs(first))
}

/** Calendar arithmetic on `YYYY-MM-DD` keys (no timezone involved). */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
