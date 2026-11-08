import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionUnverified } from '@/core/auth/session-trust'
import { cachedLoad } from '@/core/offline/cached-load'
import { getCached, putCached } from '@/core/offline/entity-cache'
import { isOnline } from '@/core/offline/use-online-status'

vi.mock('@/core/offline/entity-cache', () => ({
  getCached: vi.fn(),
  putCached: vi.fn(),
  clearCached: vi.fn(),
}))

const getCachedMock = getCached as Mock
const putCachedMock = putCached as Mock

describe('cachedLoad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isOnline.value = true
    sessionUnverified.value = false
    putCachedMock.mockResolvedValue(undefined)
  })

  it('unverified session: serves the cache without fetching, even though the device is online', async () => {
    // Every supabase-js request resolves its token through auth.getSession() first, so a
    // fetch here would queue behind auth-js's 30s refresh-retry loop and hang the caller —
    // which blocks the app from mounting at all.
    isOnline.value = true
    sessionUnverified.value = true
    getCachedMock.mockResolvedValue(['cached'])
    const fetcher = vi.fn()
    const assign = vi.fn()

    await cachedLoad('tours:unverified', fetcher, assign)

    expect(fetcher).not.toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith(['cached'])
    expect(putCachedMock).not.toHaveBeenCalled()
    sessionUnverified.value = false
  })

  it('offline: assigns the cached snapshot and never calls the fetcher or overwrites the cache', async () => {
    isOnline.value = false
    getCachedMock.mockResolvedValue(['cached'])
    const fetcher = vi.fn()
    const assign = vi.fn()

    await cachedLoad('tours:offline', fetcher, assign)

    expect(assign).toHaveBeenCalledExactlyOnceWith(['cached'])
    expect(fetcher).not.toHaveBeenCalled()
    expect(putCachedMock).not.toHaveBeenCalled()
  })

  it('online: overwrites the store and the cache with the fresh result', async () => {
    getCachedMock.mockResolvedValue(undefined)
    const fetcher = vi.fn().mockResolvedValue(['fresh'])
    const assign = vi.fn()

    await cachedLoad('tours:fresh', fetcher, assign)

    expect(assign).toHaveBeenLastCalledWith(['fresh'])
    expect(putCachedMock).toHaveBeenCalledWith('tours:fresh', ['fresh'])
  })

  it('online fetch failure: keeps the cached snapshot, does not overwrite the cache, and rethrows', async () => {
    getCachedMock.mockResolvedValue(['cached'])
    const boom = new Error('network down')
    const fetcher = vi.fn().mockRejectedValue(boom)
    const assign = vi.fn()

    await expect(cachedLoad('tours:fail', fetcher, assign)).rejects.toThrow('network down')

    // cached snapshot painted exactly once; never overwritten with anything else
    expect(assign).toHaveBeenCalledExactlyOnceWith(['cached'])
    expect(putCachedMock).not.toHaveBeenCalled()
  })

  it('unavailable IndexedDB on read degrades to a plain network load', async () => {
    getCachedMock.mockRejectedValue(new Error('no indexeddb'))
    const fetcher = vi.fn().mockResolvedValue(['fresh'])
    const assign = vi.fn()

    await cachedLoad('tours:noidb', fetcher, assign)

    expect(assign).toHaveBeenCalledExactlyOnceWith(['fresh'])
  })

  it('warm online reload: skips the cache paint so a stale snapshot never flickers in', async () => {
    // Cold load seeds "seen fresh" for the key.
    getCachedMock.mockResolvedValue(undefined)
    const fetcher = vi.fn().mockResolvedValue(['fresh'])
    const assign = vi.fn()
    await cachedLoad('tours:warm', fetcher, assign)

    // Warm reload: the cache now holds a STALE snapshot (e.g. after an online optimistic
    // write the cache never received). It must NOT be painted — only the fresh result is.
    vi.clearAllMocks()
    putCachedMock.mockResolvedValue(undefined)
    getCachedMock.mockResolvedValue(['stale'])
    fetcher.mockResolvedValue(['fresh2'])

    await cachedLoad('tours:warm', fetcher, assign)

    expect(getCachedMock).not.toHaveBeenCalled() // cache read skipped entirely
    expect(assign).toHaveBeenCalledExactlyOnceWith(['fresh2']) // only the network result painted
  })
})
