import type { WriteQueueEntry } from '@/core/offline/write-queue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearReplayHandlers,
  PermanentReplayError,
  registerReplay,
  replayQueue,
} from '@/core/offline/replay'
import { isOnline } from '@/core/offline/use-online-status'

vi.mock('@/core/utils/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }) },
  },
}))

// Mock the queue store so the drain LOGIC is tested in isolation — no IndexedDB.
vi.mock('@/core/offline/write-queue', () => ({
  peekAllOrdered: vi.fn(),
  remove: vi.fn(async () => {}),
  bumpAttempt: vi.fn(async () => {}),
  deadLetter: vi.fn(async () => {}),
}))

const { peekAllOrdered, remove, bumpAttempt, deadLetter } = await import('@/core/offline/write-queue')

function entry(over: Partial<WriteQueueEntry>): WriteQueueEntry {
  return { entityId: 'e', kind: 'tour', op: 'update', payload: {}, seq: 1, attempts: 0, ...over }
}

beforeEach(() => {
  vi.useFakeTimers() // neutralize the backoff retry timer
  clearReplayHandlers()
  vi.mocked(peekAllOrdered).mockReset()
  vi.mocked(remove).mockClear()
  vi.mocked(bumpAttempt).mockClear()
  vi.mocked(deadLetter).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  isOnline.value = true // restore the happy-dom default for the next test
})

describe('replayQueue drain', () => {
  it('does NOT drain without a session — no attempt is burned while the token refresh is pending', async () => {
    const { supabase } = await import('@/core/utils/supabase')
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null } } as never)
    registerReplay('tour', async () => {
      throw new Error('401') // a stale JWT would fail every entry
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([entry({ entityId: 'a', attempts: 4 })])

    await replayQueue()

    expect(bumpAttempt).not.toHaveBeenCalled()
    expect(deadLetter).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('does NOT drain while offline — the pending write stays queued, never dead-lettered', async () => {
    isOnline.value = false
    registerReplay('tour', async () => {
      throw new Error('network') // would burn attempts → dead-letter if the drain ran
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([entry({ entityId: 'a', attempts: 4 })])

    await replayQueue()

    // Bailed before touching the queue: a false-positive-online cold boot can't strand an
    // offline edit in dead-letter (the durability-test bug).
    expect(peekAllOrdered).not.toHaveBeenCalled()
    expect(deadLetter).not.toHaveBeenCalled()
    expect(bumpAttempt).not.toHaveBeenCalled()
  })

  it('removes each entry from the queue on successful dispatch, in seq order', async () => {
    const seen: number[] = []
    registerReplay('tour', async (e) => {
      seen.push(e.seq)
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([entry({ entityId: 'a', seq: 1 }), entry({ entityId: 'b', seq: 2 })])

    await replayQueue()

    expect(seen).toEqual([1, 2])
    expect(remove).toHaveBeenCalledWith('a')
    expect(remove).toHaveBeenCalledWith('b')
    expect(deadLetter).not.toHaveBeenCalled()
  })

  it('a transient failure bumps attempts and does NOT dead-letter', async () => {
    registerReplay('tour', async () => {
      throw new Error('network')
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([entry({ entityId: 'a', attempts: 0 })])

    await replayQueue()

    expect(bumpAttempt).toHaveBeenCalledWith('a')
    expect(deadLetter).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it('a permanent failure dead-letters AND the drain keeps going', async () => {
    registerReplay('tour', async (e) => {
      if (e.entityId === 'a')
        throw new PermanentReplayError('validation')
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([entry({ entityId: 'a', seq: 1 }), entry({ entityId: 'b', seq: 2 })])

    await replayQueue()

    expect(deadLetter).toHaveBeenCalledWith('a', 'permanent')
    expect(remove).toHaveBeenCalledWith('b') // not head-of-line blocked
  })

  it('a transient failure at the attempts cap dead-letters as transient (retryable), no bump', async () => {
    registerReplay('tour', async () => {
      throw new Error('network')
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([entry({ entityId: 'a', attempts: 4 })]) // 4 + 1 >= MAX_ATTEMPTS(5)

    await replayQueue()

    // A network/5xx outage that exhausted its budget may recover later — tag it 'transient' so the
    // review surface offers Retry, unlike a 'permanent' (validation/RLS) or 'conflict' (LWW) failure.
    expect(deadLetter).toHaveBeenCalledWith('a', 'transient')
    expect(bumpAttempt).not.toHaveBeenCalled()
  })

  it('an LWW-loser (PermanentReplayError mentioning LWW) dead-letters as a conflict', async () => {
    registerReplay('tour', async () => {
      throw new PermanentReplayError('tour changed on the server since this edit (LWW loser)')
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([entry({ entityId: 'a' })])

    await replayQueue()

    expect(deadLetter).toHaveBeenCalledWith('a', 'conflict')
  })

  it('a dead-lettered create cascades to a pending entry that references it', async () => {
    const dispatched: string[] = []
    registerReplay('contact', async (e) => {
      dispatched.push(e.entityId)
      throw new PermanentReplayError('rls') // contact create fails permanently
    })
    registerReplay('tour', async (e) => {
      dispatched.push(e.entityId)
    })
    vi.mocked(peekAllOrdered).mockResolvedValue([
      entry({ entityId: 'contact-1', kind: 'contact', op: 'create', seq: 1 }),
      entry({ entityId: 'tour-9', kind: 'tour', op: 'create', seq: 2, payload: { partnerIds: ['contact-1'] } }),
    ])

    await replayQueue()

    expect(deadLetter).toHaveBeenCalledWith('contact-1', 'permanent')
    expect(deadLetter).toHaveBeenCalledWith('tour-9', 'permanent') // cascaded
    expect(dispatched).not.toContain('tour-9') // never even dispatched
  })
})
