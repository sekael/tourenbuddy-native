import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { sessionUnverified } from '@/core/auth/session-trust'

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}

const mockOnAuthStateChange = vi.fn()
const mockSetAuth = vi.fn()
const mockRemoveChannel = vi.fn()

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue(mockChannel),
    removeChannel: mockRemoveChannel,
    auth: {
      onAuthStateChange: mockOnAuthStateChange,
    },
    realtime: {
      setAuth: mockSetAuth,
    },
  },
}))

// Import after mock is set up
const { useRealtimeSubscription, __resetRealtimeRegistry } = await import(
  '@/core/realtime/use-realtime-subscription'
)
const { supabase } = await import('@/core/utils/supabase')

// Capture the module-level TOKEN_REFRESHED listener registered during import
// (before any beforeEach clears the mock)
const capturedAuthCb = mockOnAuthStateChange.mock.calls[0]?.[0] as
  | ((event: string, session: { access_token: string } | null) => void)
  | undefined

function makeOpts(overrides: Partial<Parameters<typeof useRealtimeSubscription>[0]> = {}) {
  return {
    key: () => 'test-key',
    enabled: () => true,
    bindings: () => [{ event: '*' as const, table: 'friend_requests' }],
    onChange: vi.fn(),
    ...overrides,
  }
}

describe('useRealtimeSubscription', () => {
  beforeEach(() => {
    // Reset registry first so its removeChannel calls don't pollute mock counts
    __resetRealtimeRegistry()
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
    setActivePinia(createPinia())
  })

  it('(a) creates channel when enabled and key present', async () => {
    useRealtimeSubscription(makeOpts())
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledWith('test-key')
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('(b) calls removeChannel when enabled flips false', async () => {
    const enabled = ref(true)
    useRealtimeSubscription(makeOpts({ enabled: () => enabled.value }))
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledTimes(1)

    enabled.value = false
    await nextTick()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('(c) re-attaches bindings when key changes', async () => {
    const key = ref('key-a')
    useRealtimeSubscription(makeOpts({ key: () => key.value }))
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledWith('key-a')

    key.value = 'key-b'
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledWith('key-b')
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('(d) two callers with same key share one channel; removeChannel only on last disable', async () => {
    const e1 = ref(true)
    const e2 = ref(true)
    useRealtimeSubscription(makeOpts({ enabled: () => e1.value }))
    await nextTick()
    useRealtimeSubscription(makeOpts({ enabled: () => e2.value }))
    await nextTick()

    expect(supabase.channel).toHaveBeenCalledTimes(1)

    e1.value = false
    await nextTick()
    expect(mockRemoveChannel).not.toHaveBeenCalled()

    e2.value = false
    await nextTick()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('(e) debounced onChange coalesces rapid events', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    useRealtimeSubscription(makeOpts({ onChange }))
    await nextTick()

    const onCall = vi.mocked(mockChannel.on).mock.calls[0]?.[2] as (() => void) | undefined
    onCall?.()
    onCall?.()
    onCall?.()

    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    expect(onChange).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('(f) onSubscribed invoked on SUBSCRIBED but not on other statuses', async () => {
    const onSubscribed = vi.fn()
    useRealtimeSubscription(makeOpts({ onSubscribed }))
    await nextTick()

    const subscribeCb = vi.mocked(mockChannel.subscribe).mock.calls[0]?.[0] as (s: string) => void
    subscribeCb?.('CHANNEL_ERROR')
    subscribeCb?.('SUBSCRIBED')

    expect(onSubscribed).toHaveBeenCalledTimes(1)
  })

  it('(f2) refetches when an unverified session is proven real, and only on that edge', async () => {
    // Reads are skipped for the whole unverified window, and the channel never dropped —
    // so without this the store keeps serving the cached snapshot indefinitely.
    const onSubscribed = vi.fn()
    sessionUnverified.value = true
    useRealtimeSubscription(makeOpts({ onSubscribed }))
    await nextTick()

    sessionUnverified.value = false
    await nextTick()
    expect(onSubscribed).toHaveBeenCalledTimes(1)

    // Going unverified again must not refetch — the token is unusable in that direction.
    sessionUnverified.value = true
    await nextTick()
    expect(onSubscribed).toHaveBeenCalledTimes(1)
    sessionUnverified.value = false
  })

  it('(f3) does not refetch when the consumer has no channel (hidden tab)', async () => {
    const onSubscribed = vi.fn()
    sessionUnverified.value = true
    useRealtimeSubscription(makeOpts({ enabled: () => false, onSubscribed }))
    await nextTick()

    sessionUnverified.value = false
    await nextTick()

    expect(onSubscribed).not.toHaveBeenCalled()
  })

  it('(g) stopping effectScope triggers removeChannel even when enabled stays true', async () => {
    const scope = effectScope()
    scope.run(() => {
      useRealtimeSubscription(makeOpts())
    })
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledTimes(1)

    scope.stop()
    await nextTick()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('(h) TOKEN_REFRESHED fires supabase.realtime.setAuth exactly once', () => {
    capturedAuthCb?.('TOKEN_REFRESHED', { access_token: 'new-token' })
    expect(mockSetAuth).toHaveBeenCalledWith('new-token')
    expect(mockSetAuth).toHaveBeenCalledTimes(1)
  })
})
