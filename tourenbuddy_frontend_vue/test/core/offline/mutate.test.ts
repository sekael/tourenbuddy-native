import { afterEach, describe, expect, it, vi } from 'vitest'
import { sessionUnverified } from '@/core/auth/session-trust'
import { mutate, offlineBlockedAt } from '@/core/offline/mutate'
import { isOnline } from '@/core/offline/use-online-status'

describe('mutate offline seam', () => {
  afterEach(() => {
    isOnline.value = true
    sessionUnverified.value = false
  })

  it('unverified session: blocks the online-only action even though the device reports online', async () => {
    isOnline.value = true
    sessionUnverified.value = true
    const fn = vi.fn().mockResolvedValue('done')
    // Reset rather than diff against the previous value: two tests can land in the same
    // millisecond, and `Date.now()` is what the signal carries.
    offlineBlockedAt.value = 0

    const result = await mutate(fn)

    expect(fn).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
    expect(offlineBlockedAt.value).toBeGreaterThan(0)
  })

  it('offline: does not run fn, returns undefined, and bumps the blocked signal', async () => {
    isOnline.value = false
    const fn = vi.fn().mockResolvedValue('done')
    // Reset rather than diff against the previous value: the preceding test can land in
    // the same millisecond, and `Date.now()` is what the signal carries.
    offlineBlockedAt.value = 0

    const result = await mutate(fn)

    expect(fn).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
    expect(offlineBlockedAt.value).toBeGreaterThan(0)
  })

  it('online: runs fn and returns its value without touching the blocked signal', async () => {
    isOnline.value = true
    const before = offlineBlockedAt.value

    const result = await mutate(() => Promise.resolve('done'))

    expect(result).toBe('done')
    expect(offlineBlockedAt.value).toBe(before)
  })
})
