import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushThenRefetch } from '@/core/offline/reconnect'
import { replayQueue } from '@/core/offline/replay'

vi.mock('@/core/offline/replay', () => ({ replayQueue: vi.fn() }))

const mockReplayQueue = vi.mocked(replayQueue)

/** Let all pending microtasks settle without resolving any pending drain. */
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve))

describe('flushThenRefetch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not refetch until the queue drain resolves (flush-before-refetch order)', async () => {
    let resolveDrain!: () => void
    const drain = new Promise<void>((resolve) => {
      resolveDrain = resolve
    })
    mockReplayQueue.mockReturnValue(drain)
    const refetch = vi.fn().mockResolvedValue(undefined)

    const done = flushThenRefetch(refetch)
    await flushMicrotasks()
    // Drain still pending → the refetch must not have overwritten the store yet.
    expect(refetch).not.toHaveBeenCalled()

    resolveDrain()
    await done
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('still refetches when the drain rejects, so the store is not stranded on stale cache', async () => {
    mockReplayQueue.mockRejectedValue(new Error('drain blew up'))
    const refetch = vi.fn().mockResolvedValue(undefined)

    await expect(flushThenRefetch(refetch)).resolves.toBeUndefined()
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
