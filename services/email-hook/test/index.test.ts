import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

const VALID_ENV = {
  BREVO_API_KEY: 'key-abc',
  SEND_EMAIL_HOOK_SECRET: 'whsec_dGVzdHNlY3JldA==',
  BREVO_TEMPLATE_EN: '10',
  BREVO_TEMPLATE_DE: '20',
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  VAPID_PUBLIC_KEY: 'vapid-pub',
  VAPID_PRIVATE_KEY: 'vapid-priv',
  VAPID_SUBJECT: 'mailto:no-reply@example.com',
  BREVO_TEMPLATE_FRIEND_RECEIVED_EN: '30',
  BREVO_TEMPLATE_FRIEND_RECEIVED_DE: '31',
  BREVO_TEMPLATE_FRIEND_RESPONDED_EN: '32',
  BREVO_TEMPLATE_FRIEND_RESPONDED_DE: '33',
}

const VALID_PAYLOAD = {
  user: {
    email: 'user@example.com',
    user_metadata: { locale: 'en' },
  },
  email_data: {
    token: '123456',
  },
}

vi.mock('standardwebhooks', () => ({
  // A class, not an arrow: vitest 4 mocks are only constructible (`new Webhook`) that way.
  Webhook: vi.fn().mockImplementation(class {
    verify = vi.fn()
  }),
}))

// Pass the push payload through in clear so tests can read the copy.
vi.mock('@block65/webcrypto-web-push', () => ({
  buildPushPayload: vi.fn(async (msg: { data: string }) => ({ method: 'POST', body: msg.data })),
}))

function makeRequest(body: unknown, headers: Record<string, string> = {}, path = '/') {
  return new Request(`https://worker.example.com${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'webhook-id': 'test-id',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
      'webhook-signature': 'v1,validsig',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('email-hook worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
  })

  it('returns 200 and calls Brevo on valid EN payload', async () => {
    const response = await worker.fetch(makeRequest(VALID_PAYLOAD), VALID_ENV as never)
    expect(response.status).toBe(200)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({ method: 'POST' }),
    )
    const brevoBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    )
    expect(brevoBody.templateId).toBe(10)
  })

  it('sends DE template for de locale', async () => {
    const payload = {
      ...VALID_PAYLOAD,
      user: { ...VALID_PAYLOAD.user, user_metadata: { locale: 'de' } },
    }
    await worker.fetch(makeRequest(payload), VALID_ENV as never)
    const brevoBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    )
    expect(brevoBody.templateId).toBe(20)
  })

  it('sends EN template for unknown locale', async () => {
    const payload = {
      ...VALID_PAYLOAD,
      user: { ...VALID_PAYLOAD.user, user_metadata: { locale: 'fr' } },
    }
    await worker.fetch(makeRequest(payload), VALID_ENV as never)
    const brevoBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    )
    expect(brevoBody.templateId).toBe(10)
  })

  it('forwards OTP token verbatim as params.otp', async () => {
    await worker.fetch(makeRequest(VALID_PAYLOAD), VALID_ENV as never)
    const brevoBody = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string,
    )
    expect(brevoBody.params.otp).toBe('123456')
    expect(brevoBody.params.email).toBe('user@example.com')
  })

  it('returns 400 when email_data.token is missing', async () => {
    const payload = { ...VALID_PAYLOAD, email_data: {} }
    const response = await worker.fetch(makeRequest(payload), VALID_ENV as never)
    expect(response.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 401 when signature verification fails', async () => {
    const { Webhook } = await import('standardwebhooks')
    vi.mocked(Webhook).mockImplementationOnce(class {
      verify = vi.fn().mockImplementation(() => {
        throw new Error('invalid sig')
      })
    } as never)
    const response = await worker.fetch(makeRequest(VALID_PAYLOAD), VALID_ENV as never)
    expect(response.status).toBe(401)
  })

  it('returns 500 when env config is missing', async () => {
    const env = { ...VALID_ENV, BREVO_API_KEY: '' }
    const response = await worker.fetch(makeRequest(VALID_PAYLOAD), env as never)
    expect(response.status).toBe(500)
  })

  it('returns 502 when Brevo returns an error', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
    const response = await worker.fetch(makeRequest(VALID_PAYLOAD), VALID_ENV as never)
    expect(response.status).toBe(502)
  })

  it('returns JSON content-type on success', async () => {
    const response = await worker.fetch(makeRequest(VALID_PAYLOAD), VALID_ENV as never)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(await response.text()).toBe('{}')
  })

  it('returns 405 for non-POST methods', async () => {
    const req = new Request('https://worker.example.com/', { method: 'GET' })
    const response = await worker.fetch(req, VALID_ENV as never)
    expect(response.status).toBe(405)
  })
})

describe('notify/event', () => {
  const ENV = { ...VALID_ENV, NOTIFY_WEBHOOK_SECRET: 'hook-secret' }
  const ROW = {
    id: 'n1',
    recipient_id: 'user-b',
    type: 'friend_requests',
    action: 'received',
    actor_name: 'Alice Smith',
    tour_name: null,
  }

  function eventRequest(body: unknown, secret = 'hook-secret') {
    return new Request('https://worker.example.com/notify/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-notify-secret': secret },
      body: JSON.stringify(body),
    })
  }

  /** profile → email → push_subscriptions (no rows) → anything else OK. */
  function mockSupabase(profile: Record<string, unknown>) {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/rest/v1/user_profile'))
        return new Response(JSON.stringify([profile]), { status: 200 })
      if (url.includes('/auth/v1/admin/users/'))
        return new Response(JSON.stringify({ email: 'b@example.com' }), { status: 200 })
      if (url.includes('/rest/v1/push_subscriptions'))
        return new Response('[]', { status: 200 })
      return new Response('OK', { status: 200 })
    }) as typeof fetch
  }

  function calledUrls(): string[] {
    return (fetch as ReturnType<typeof vi.fn>).mock.calls.map(c => String(c[0]))
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should reject a wrong secret with 401 before touching Supabase', async () => {
    mockSupabase({ notif_email_enabled: true, notif_muted_types: [], locale: 'en' })
    const response = await worker.fetch(eventRequest(ROW, 'wrong'), ENV as never)
    expect(response.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('should fail closed with 500 when the secret is not configured', async () => {
    mockSupabase({ notif_email_enabled: true, notif_muted_types: [], locale: 'en' })
    const response = await worker.fetch(eventRequest(ROW), VALID_ENV as never)
    expect(response.status).toBe(500)
  })

  it('should send neither push nor email when the type is muted', async () => {
    mockSupabase({ notif_email_enabled: true, notif_muted_types: ['friend_requests'], locale: 'en' })
    const response = await worker.fetch(eventRequest(ROW), ENV as never)
    expect(response.status).toBe(200)
    expect(calledUrls().some(u => u.includes('push_subscriptions'))).toBe(false)
    expect(calledUrls()).not.toContain('https://api.brevo.com/v3/smtp/email')
  })

  it('should skip email but still try push when email is off (no account push flag)', async () => {
    mockSupabase({ notif_email_enabled: false, notif_muted_types: [], locale: 'en' })
    const response = await worker.fetch(eventRequest(ROW), ENV as never)
    expect(response.status).toBe(200)
    expect(calledUrls().some(u => u.includes('/rest/v1/push_subscriptions?user_id=eq.user-b'))).toBe(true)
    expect(calledUrls()).not.toContain('https://api.brevo.com/v3/smtp/email')
  })

  it('should map the backfill action to the Brevo backfill_digest branch', async () => {
    mockSupabase({ notif_email_enabled: true, notif_muted_types: [], locale: 'en' })
    const env = { ...ENV, BREVO_TEMPLATE_TOUR_INTEREST_EN: '40' }
    await worker.fetch(eventRequest({ ...ROW, type: 'tour_interest', action: 'backfill' }), env as never)
    const brevo = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === 'https://api.brevo.com/v3/smtp/email')
    expect(JSON.parse(brevo![1].body as string).params.action).toBe('backfill_digest')
  })

  describe('actor-less job entries', () => {
    const PUSH_ENDPOINT = 'https://push.example/sub'

    /** Recipient profile + one push device; the first friend's profile is `friend` (null = deleted). */
    function mockJobSupabase(friend: { first_name: string, last_name: string } | null, muted: string[] = []) {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/rest/v1/user_profile') && url.includes('select=first_name'))
          return new Response(JSON.stringify(friend ? [friend] : []), { status: 200 })
        if (url.includes('/rest/v1/user_profile'))
          return new Response(JSON.stringify([{ notif_email_enabled: true, notif_muted_types: muted, locale: 'en' }]), { status: 200 })
        if (url.includes('/auth/v1/admin/users/'))
          return new Response(JSON.stringify({ email: 'b@example.com' }), { status: 200 })
        if (url.includes('/rest/v1/push_subscriptions'))
          return new Response(JSON.stringify([{ id: 's1', user_id: 'user-b', endpoint: PUSH_ENDPOINT, p256dh: 'k', auth: 'a' }]), { status: 200 })
        return new Response('OK', { status: 201 })
      }) as typeof fetch
    }

    function bodyOf(url: string) {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === url)
      return call ? JSON.parse(call[1].body as string) : undefined
    }

    const SUMMARY = { ...ROW, type: 'availability', action: 'weekly', actor_name: null }

    it('should name a single friend without a count', async () => {
      mockJobSupabase({ first_name: 'Anna', last_name: 'Muster' })
      await worker.fetch(eventRequest({ ...SUMMARY, ref: { friend_ids: ['f1'] } }), ENV as never)
      expect(bodyOf(PUSH_ENDPOINT).body).toBe('Anna Muster is free this week when you are.')
    })

    it('should name the first friend plus the count of the others in push and email', async () => {
      mockJobSupabase({ first_name: 'Anna', last_name: 'Muster' })
      const env = { ...ENV, BREVO_TEMPLATE_TOUR_UPDATES_EN: '50' }
      await worker.fetch(eventRequest({ ...SUMMARY, ref: { friend_ids: ['f1', 'f2', 'f3'] } }), env as never)
      expect(bodyOf(PUSH_ENDPOINT).body).toBe('Anna Muster and 2 more are free this week when you are.')
      expect(bodyOf(PUSH_ENDPOINT).url).toBe('https://test.tourenbuddy.ch/?notification=n1')
      expect(bodyOf('https://api.brevo.com/v3/smtp/email').params).toMatchObject({
        action: 'availability_weekly',
        actorName: 'Anna Muster',
        moreCount: 2,
      })
    })

    it('should fall back to a generic name when the first friend is gone', async () => {
      mockJobSupabase(null)
      await worker.fetch(eventRequest({ ...SUMMARY, ref: { friend_ids: ['gone', 'f2'] } }), ENV as never)
      expect(bodyOf(PUSH_ENDPOINT).body).toBe('A friend and 1 more are free this week when you are.')
    })

    it('should send nothing for a muted summary', async () => {
      mockJobSupabase({ first_name: 'Anna', last_name: 'Muster' }, ['availability'])
      await worker.fetch(eventRequest({ ...SUMMARY, ref: { friend_ids: ['f1'] } }), ENV as never)
      expect(bodyOf(PUSH_ENDPOINT)).toBeUndefined()
      expect(calledUrls().some(u => u.includes('select=first_name'))).toBe(false)
    })

    it('should remind with the tour name and the tour_reminder email action', async () => {
      mockJobSupabase(null)
      const env = { ...ENV, BREVO_TEMPLATE_TOUR_UPDATES_EN: '50' }
      await worker.fetch(eventRequest({ ...ROW, type: 'tour_reminders', action: 'upcoming', actor_name: null, tour_name: 'Piz Ela' }), env as never)
      expect(bodyOf(PUSH_ENDPOINT).body).toBe('“Piz Ela” is in 5 days.')
      expect(bodyOf('https://api.brevo.com/v3/smtp/email').params.action).toBe('tour_reminder')
    })
  })

  it('should return 400 for a row without recipient', async () => {
    mockSupabase({ notif_email_enabled: true, notif_muted_types: [], locale: 'en' })
    const response = await worker.fetch(eventRequest({ id: 'n1', type: 'tour_updates' }), ENV as never)
    expect(response.status).toBe(400)
  })
})
