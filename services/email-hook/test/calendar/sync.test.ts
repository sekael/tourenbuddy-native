import { afterEach, describe, expect, it, vi } from 'vitest'
import { purgePastAvailability, syncUser } from '../../src/calendar/sync'

vi.mock('../../src/calendar/busy-days', () => ({ deriveAvailableDays: () => ['2030-07-01'] }))

const env = { SUPABASE_URL: 'https://db', SUPABASE_SERVICE_ROLE_KEY: 'srk' } as never
const feeds = [
  { id: 'f1', url: 'https://a/cal.ics', etag: null, last_modified: null, last_synced_at: null },
  { id: 'f2', url: 'https://b/cal.ics', etag: null, last_modified: null, last_synced_at: null },
]
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:x\r\nEND:VCALENDAR'

function stubFetch(feedB: () => Response, rows: unknown[] = feeds) {
  const calls: { url: string, init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (new Headers(init?.headers).has('If-None-Match'))
      return new Response(null, { status: 304 })
    if (url.includes('user_calendar_feeds?user_id'))
      return Response.json(rows)
    if (url.includes('user_calendar_settings'))
      return Response.json([])
    if (url === 'https://a/cal.ics')
      return new Response(ICS)
    if (url === 'https://b/cal.ics')
      return feedB()
    return new Response(null, { status: 204 })
  }))
  return calls
}

const rpcCalled = (calls: { url: string }[]) => calls.some(c => c.url.includes('rpc/apply_calendar_availability'))
function patches(calls: { url: string, init?: RequestInit }[]) {
  return calls.filter(c => c.init?.method === 'PATCH').map(c => [c.url.split('eq.')[1], JSON.parse(String(c.init!.body))])
}

describe('syncUser', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('should write nothing when one of two feeds fails', async () => {
    const calls = stubFetch(() => new Response('gone', { status: 403 }))
    expect(await syncUser(env, 'u1')).toBe('failed')
    expect(rpcCalled(calls)).toBe(false)
    expect(patches(calls)).toEqual([['f2', { last_error: 'http_403' }]])
  })

  it('should fail closed on a 200 that is not iCalendar', async () => {
    const calls = stubFetch(() => new Response('<html>sign in</html>'))
    expect(await syncUser(env, 'u1')).toBe('failed')
    expect(rpcCalled(calls)).toBe(false)
  })

  it('should fail with too_large when Content-Length exceeds 2 MB', async () => {
    const calls = stubFetch(() => new Response(ICS, { headers: { 'content-length': String(3 * 1024 * 1024) } }))
    expect(await syncUser(env, 'u1')).toBe('failed')
    expect(patches(calls)).toEqual([['f2', { last_error: 'too_large' }]])
  })

  it('should recompute on demand even when every feed answers 304 the same day', async () => {
    const now = new Date('2030-07-01T10:00:00Z')
    const synced = feeds.map(f => ({ ...f, etag: '"v1"', last_synced_at: '2030-07-01T04:00:00Z' }))
    const calls = stubFetch(() => new Response(ICS), synced)
    expect(await syncUser(env, 'u1', { now })).toBe('unchanged') // cron: all-304 short-circuit
    expect(await syncUser(env, 'u1', { now, conditional: false })).toBe('synced')
    expect(rpcCalled(calls)).toBe(true)
  })

  it('should fail with too_large when an unannounced stream passes 2 MB', async () => {
    const calls = stubFetch(() => new Response(new Blob(['x'.repeat(2 * 1024 * 1024 + 1)]).stream()))
    expect(await syncUser(env, 'u1')).toBe('failed')
    expect(patches(calls)).toEqual([['f2', { last_error: 'too_large' }]])
  })
})

describe('purgePastAvailability', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('should cut off at the Zurich date, not the UTC date', async () => {
    const calls = stubFetch(() => new Response(ICS))
    await purgePastAvailability(env, new Date('2026-09-29T22:30:00Z'))
    expect(calls).toEqual([{ url: 'https://db/rest/v1/user_availability?date=lt.2026-09-30', init: expect.objectContaining({ method: 'DELETE' }) }])
  })
})
