import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnline } from '@/core/offline/use-online-status'

describe('useOnlineStatus singleton', () => {
  afterEach(() => {
    isOnline.value = true
  })

  it('flips to false on a window offline event and back to true on online', () => {
    window.dispatchEvent(new Event('offline'))
    expect(isOnline.value).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(isOnline.value).toBe(true)
  })
})

// Reachability (task 10.6): the HEAD health probe is the LAST-RESORT tier — it only runs
// while offline (to detect recovery), never as a fixed poll while online. So while online
// with nothing to do, zero HEAD probes are issued; the flush is event-driven (transition /
// foreground / WS-SUBSCRIBED), not a battery-draining loop.
describe('useOnlineStatus reachability probe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    window.dispatchEvent(new Event('online')) // clear any armed probe, start online
  })
  afterEach(() => {
    window.dispatchEvent(new Event('online')) // disarm the interval before leaving
    vi.useRealTimers()
    vi.unstubAllGlobals()
    isOnline.value = true
  })

  it('issues NO HEAD probe while online (no polling loop)', async () => {
    await vi.advanceTimersByTimeAsync(20_000)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('arms the recovery probe only after going offline', async () => {
    window.dispatchEvent(new Event('offline'))
    expect(isOnline.value).toBe(false)

    await vi.advanceTimersByTimeAsync(6000)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('__online_check__'),
      expect.objectContaining({ method: 'HEAD' }),
    )
  })
})
