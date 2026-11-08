import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerFlushTriggers } from '@/core/offline/flush-triggers'
import { replayQueue } from '@/core/offline/replay'
import { isOnline } from '@/core/offline/use-online-status'

vi.mock('@/core/offline/replay', () => ({ replayQueue: vi.fn() }))

let emitAuthEvent: ((event: string) => void) | undefined
vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((cb: (event: string) => void) => {
        emitAuthEvent = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
  },
}))

const mockReplayQueue = vi.mocked(replayQueue)
const tick = () => new Promise(resolve => setTimeout(resolve))

// registerFlushTriggers is a module-level singleton (registers once) — set it up once
// for the suite, then drive the signals it listens to.
registerFlushTriggers()

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('registerFlushTriggers', () => {
  beforeEach(() => {
    mockReplayQueue.mockClear()
    isOnline.value = true
  })

  afterEach(() => {
    isOnline.value = true
  })

  it('drains on the offline → online transition, not on going offline', async () => {
    isOnline.value = false
    await tick()
    expect(mockReplayQueue).not.toHaveBeenCalled()

    isOnline.value = true
    await tick()
    expect(mockReplayQueue).toHaveBeenCalledTimes(1)
  })

  it('does not drain when foregrounded while offline (no false-positive flush)', async () => {
    isOnline.value = false
    await tick()
    mockReplayQueue.mockClear()

    setVisibility('visible')
    expect(mockReplayQueue).not.toHaveBeenCalled()
  })

  it('drains when foregrounded while reachable', () => {
    setVisibility('hidden')
    setVisibility('visible')
    expect(mockReplayQueue).toHaveBeenCalledTimes(1)
  })

  it('drains when a session arrives — the drain guard bails until the token is real', () => {
    emitAuthEvent?.('TOKEN_REFRESHED')
    expect(mockReplayQueue).toHaveBeenCalledTimes(1)

    emitAuthEvent?.('SIGNED_IN')
    expect(mockReplayQueue).toHaveBeenCalledTimes(2)
  })

  it('does not drain on an auth event that carries no session', () => {
    emitAuthEvent?.('SIGNED_OUT')
    expect(mockReplayQueue).not.toHaveBeenCalled()
  })
})
