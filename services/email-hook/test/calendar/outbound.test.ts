import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTourFeed, renderTourFeed } from '../../src/calendar/outbound'

const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srk' } as never
const tour = { id: 't1', name: 'Piz Palü', planned_date: '2030-07-31', end_date: null }
const unfold = (ics: string) => ics.replace(/\r\n /g, '')

describe('renderTourFeed', () => {
  it('should omit a tour without a planned date', () => {
    expect(renderTourFeed([{ ...tour, planned_date: null as never }])).not.toContain('BEGIN:VEVENT')
  })

  it('should escape comma, semicolon and backslash in the summary', () => {
    expect(renderTourFeed([{ ...tour, name: 'A, B; C\\D' }])).toContain('SUMMARY:A\\, B\\; C\\\\D')
  })

  it('should set DTEND to the day after DTSTART, across a month boundary', () => {
    const ics = renderTourFeed([tour])
    expect(ics).toContain('DTSTART;VALUE=DATE:20300731')
    expect(ics).toContain('DTEND;VALUE=DATE:20300801')
  })

  it('should fold long lines at 75 octets without splitting a multi-byte character', () => {
    const ics = renderTourFeed([{ ...tour, name: 'ü'.repeat(60) }])
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(unfold(ics)).toContain(`SUMMARY:${'ü'.repeat(60)}`)
  })
})

describe('handleTourFeed', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('should return a bare 404 for an unknown token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]')))
    const res = await handleTourFeed('/calendar/00000000-0000-0000-0000-000000000000.ics', env)
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('Not found')
  })

  it('should return 404 without querying for a malformed token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await handleTourFeed('/calendar/not-a-token.ics', env)).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
