import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

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

const { useRealtimeBroadcast, __resetRealtimeBroadcastRegistry } = await import(
  '@/core/realtime/use-realtime-broadcast'
)
const { supabase } = await import('@/core/utils/supabase')

const capturedAuthCb = mockOnAuthStateChange.mock.calls[0]?.[0] as
  | ((event: string, session: { access_token: string } | null) => void)
  | undefined

function makeOpts(overrides: Partial<Parameters<typeof useRealtimeBroadcast>[0]> = {}) {
  return {
    topic: () => 'friend-tours:user-1',
    enabled: () => true,
    event: 'refetch',
    onMessage: vi.fn(),
    ...overrides,
  }
}

describe('useRealtimeBroadcast', () => {
  beforeEach(() => {
    __resetRealtimeBroadcastRegistry()
    vi.clearAllMocks()
    mockChannel.on.mockReturnValue(mockChannel)
    mockChannel.subscribe.mockReturnValue(mockChannel)
    setActivePinia(createPinia())
  })

  it('(a) creates private channel with correct topic key', async () => {
    useRealtimeBroadcast(makeOpts())
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledWith('friend-tours:user-1', { config: { private: true } })
    expect(mockChannel.on).toHaveBeenCalledWith('broadcast', { event: 'refetch' }, expect.any(Function))
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('(b) no channel created when topic is null', async () => {
    useRealtimeBroadcast(makeOpts({ topic: () => null }))
    await nextTick()
    expect(supabase.channel).not.toHaveBeenCalled()
  })

  it('(c) no channel created when disabled', async () => {
    useRealtimeBroadcast(makeOpts({ enabled: () => false }))
    await nextTick()
    expect(supabase.channel).not.toHaveBeenCalled()
  })

  it('(d) two callers with same topic share one channel; removeChannel only on last release', async () => {
    const e1 = ref(true)
    const e2 = ref(true)
    useRealtimeBroadcast(makeOpts({ enabled: () => e1.value }))
    await nextTick()
    useRealtimeBroadcast(makeOpts({ enabled: () => e2.value }))
    await nextTick()

    expect(supabase.channel).toHaveBeenCalledTimes(1)

    e1.value = false
    await nextTick()
    expect(mockRemoveChannel).not.toHaveBeenCalled()

    e2.value = false
    await nextTick()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)
  })

  it('(e) visibility-hidden removes channel; visible restores it', async () => {
    const scope = effectScope()
    scope.run(() => {
      useRealtimeBroadcast(makeOpts())
    })
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(supabase.channel).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('(f) onMessage debounced: multiple rapid calls → single callback', async () => {
    vi.useFakeTimers()
    const onMessage = vi.fn()
    useRealtimeBroadcast(makeOpts({ onMessage }))
    await nextTick()

    const broadcastCb = mockChannel.on.mock.calls.find(
      c => c[0] === 'broadcast',
    )?.[2] as (() => void) | undefined
    expect(broadcastCb).toBeDefined()

    broadcastCb!()
    broadcastCb!()
    broadcastCb!()
    expect(onMessage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(onMessage).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('(g) onSubscribed fires after SUBSCRIBED status', async () => {
    let subscribeCb: ((s: string) => void) | undefined
    mockChannel.subscribe.mockImplementation((cb: (s: string) => void) => {
      subscribeCb = cb
      return mockChannel
    })
    const onSubscribed = vi.fn()
    useRealtimeBroadcast(makeOpts({ onSubscribed }))
    await nextTick()

    expect(onSubscribed).not.toHaveBeenCalled()
    subscribeCb!('SUBSCRIBED')
    expect(onSubscribed).toHaveBeenCalledTimes(1)
  })

  it('(h) TOKEN_REFRESHED → setAuth called', async () => {
    useRealtimeBroadcast(makeOpts())
    await nextTick()

    capturedAuthCb?.('TOKEN_REFRESHED', { access_token: 'new-token' })
    expect(mockSetAuth).toHaveBeenCalledWith('new-token')
  })
})
