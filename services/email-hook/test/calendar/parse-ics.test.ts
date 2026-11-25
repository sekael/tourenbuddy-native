import { describe, expect, it } from 'vitest'
import { IcsParseError, parseIcs } from '../../src/calendar/parse-ics'

const from = new Date('2030-07-01T00:00Z')
const to = new Date('2030-07-29T00:00Z')
const cal = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//t//t//EN', ...events, 'END:VCALENDAR'].join('\r\n')
const ev = (...props: string[]) => ['BEGIN:VEVENT', 'DTSTAMP:20300101T000000Z', ...props, 'END:VEVENT'].join('\r\n')

describe('parseIcs', () => {
  it('should throw on a body that is not iCalendar', () => {
    expect(() => parseIcs('<html>login</html>', from, to)).toThrow(IcsParseError)
  })

  it('should drop all-day, own-outbound, cancelled and show-as-free events', () => {
    const body = cal(
      ev('UID:a', 'DTSTART;VALUE=DATE:20300702', 'DTEND;VALUE=DATE:20300703'),
      ev('UID:tour-1@tourenbuddy', 'DTSTART:20300703T080000Z', 'DTEND:20300703T160000Z'),
      ev('UID:c', 'STATUS:CANCELLED', 'DTSTART:20300704T080000Z', 'DTEND:20300704T160000Z'),
      ev('UID:d', 'TRANSP:TRANSPARENT', 'DTSTART:20300705T080000Z', 'DTEND:20300705T160000Z'),
    )
    expect(parseIcs(body, from, to)).toEqual([])
  })

  it('should expand a past-dated weekly RRULE into the horizon, honouring EXDATE', () => {
    // Monday 2019-07-01; 2030-07-08 is excluded.
    const body = cal(ev('UID:w', 'DTSTART:20190701T070000Z', 'DTEND:20190701T150000Z', 'RRULE:FREQ=WEEKLY', 'EXDATE:20300708T070000Z'))
    expect(parseIcs(body, from, to).map(o => o.start.toISOString().slice(0, 10)))
      .toEqual(['2030-07-01', '2030-07-15', '2030-07-22'])
  })

  it('should move an occurrence overridden by RECURRENCE-ID', () => {
    const body = cal(
      ev('UID:m', 'DTSTART:20300701T070000Z', 'DTEND:20300701T150000Z', 'RRULE:FREQ=WEEKLY;COUNT=2'),
      ev('UID:m', 'RECURRENCE-ID:20300708T070000Z', 'DTSTART:20300709T070000Z', 'DTEND:20300709T080000Z'),
    )
    expect(parseIcs(body, from, to).map(o => o.start.toISOString()))
      .toEqual(['2030-07-01T07:00:00.000Z', '2030-07-09T07:00:00.000Z'])
  })

  it('should read a floating time as Zurich wall time, not UTC', () => {
    const [o] = parseIcs(cal(ev('UID:f', 'DTSTART:20300701T090000', 'DTEND:20300701T100000')), from, to)
    expect(o.start.toISOString()).toBe('2030-07-01T07:00:00.000Z')
  })

  it('should keep every other occurrence when exceptions move one across the horizon edge', () => {
    // Slot 07-08 moves out past `to`; slot 07-29 (past `to`) moves in to 07-24.
    const body = cal(
      ev('UID:x', 'DTSTART:20300701T070000Z', 'DTEND:20300701T150000Z', 'RRULE:FREQ=WEEKLY'),
      ev('UID:x', 'RECURRENCE-ID:20300708T070000Z', 'DTSTART:20300805T070000Z', 'DTEND:20300805T150000Z'),
      ev('UID:x', 'RECURRENCE-ID:20300729T070000Z', 'DTSTART:20300724T070000Z', 'DTEND:20300724T150000Z'),
    )
    expect(parseIcs(body, from, to).map(o => o.start.toISOString().slice(0, 10)))
      .toEqual(['2030-07-01', '2030-07-15', '2030-07-22', '2030-07-24'])
  })

  it('should throw IcsParseError, not a raw ical.js error, for an event it cannot read', () => {
    expect(() => parseIcs(cal(ev('UID:n')), from, to)).toThrow(IcsParseError)
    expect(() => parseIcs(cal(ev('UID:g', 'DTSTART:garbage')), from, to)).toThrow(IcsParseError)
  })
})
