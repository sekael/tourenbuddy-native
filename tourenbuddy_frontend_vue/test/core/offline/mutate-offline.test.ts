import type { MutateSpec } from '@/core/offline/mutate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import 'fake-indexeddb/auto'

// Real IndexedDB (fake-indexeddb) so the DC2 single-transaction enqueue is exercised
// end to end: the cache write-through and the queue put must land together or not at all.
// The `data-cache-db` module is wrapped so ONE test can abort the queue put mid-transaction
// and assert the cache write rolled back with it (atomicity, task 10.1a).

const sabotage = { enabled: false }

vi.mock('@/core/offline/data-cache-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/offline/data-cache-db')>()
  return {
    ...actual,
    openDataCacheDb: async () => {
      const db = await actual.openDataCacheDb()
      if (!sabotage.enabled)
        return db
      const realTransaction = db.transaction.bind(db)
      // Override for the abort simulation only.
      db.transaction = (...args: Parameters<IDBDatabase['transaction']>) => {
        const tx = realTransaction(...args)
        const realObjectStore = tx.objectStore.bind(tx)
        tx.objectStore = (name: string) => {
          const store = realObjectStore(name)
          if (name === actual.QUEUE_STORE) {
            const realPut = store.put.bind(store)
            store.put = (...putArgs: Parameters<IDBObjectStore['put']>) => {
              const req = realPut(...putArgs)
              tx.abort() // simulate a failure BETWEEN the cache write and the queue write
              return req
            }
          }
          return store
        }
        return tx
      }
      return db
    },
  }
})

const { sessionUnverified } = await import('@/core/auth/session-trust')
const { mutate, offlineWriteError } = await import('@/core/offline/mutate')
const { isOnline } = await import('@/core/offline/use-online-status')
const { getCached, clearCached } = await import('@/core/offline/entity-cache')
const { getEntry, peekAllOrdered, remove } = await import('@/core/offline/write-queue')

interface Row { id: string, name: string }

function spec(over: Partial<MutateSpec<Row>> & { entityId: string }): MutateSpec<Row> {
  const { entityId, ...rest } = over
  return {
    run: () => {},
    intent: { entityId, kind: 'tour', op: 'create', payload: { id: entityId } },
    cacheKey: 'tours:me',
    current: [],
    apply: rows => [...rows, { id: entityId, name: 'a' }],
    assign: () => {},
    ...rest,
  }
}

describe('mutate queue-form offline enqueue (DC2)', () => {
  beforeEach(() => {
    isOnline.value = false
    sabotage.enabled = false
    offlineWriteError.value = null
  })
  afterEach(async () => {
    isOnline.value = true
    sessionUnverified.value = false
    await clearCached('tours:me')
    await remove('t1').catch(() => {})
  })

  it('queues the write while the session is unverified, even though the device is online', async () => {
    // The restored-but-unrefreshed session holds a stale JWT: running `spec.run()` would
    // 401 and the edit would die in the store's error state instead of the durable queue.
    isOnline.value = true
    sessionUnverified.value = true
    const run = vi.fn()

    const result = await mutate<Row>(spec({ entityId: 't1', run }))

    expect(run).not.toHaveBeenCalled()
    expect(result).toEqual({ queued: true, failed: false })
    expect(await getEntry('t1')).toBeDefined()
    sessionUnverified.value = false
  })

  it('round-trips a Blob on the queue entry and survives a DB reopen', async () => {
    const blob = new Blob(['GPX-BYTES'], { type: 'application/gpx+xml' })
    await mutate<Row>(spec({
      entityId: 't1',
      intent: { entityId: 't1', kind: 'tour', op: 'create', payload: { id: 't1' }, blobs: { 'k.gpx': blob } },
    }))

    // getEntry opens the DB afresh — proves the blob persisted under its key, not just an
    // in-memory ref. (Across the happy-dom / node realm boundary the cloned Blob loses its
    // prototype, so assert on the surviving `type` rather than instanceof / size.)
    const stored = (await getEntry('t1'))?.blobs?.['k.gpx']
    expect(stored).toBeDefined()
    expect(stored?.type).toBe('application/gpx+xml')
  })

  it('keeps ONE entry per entity across a create-then-edit (coalesced, not two rows)', async () => {
    await mutate<Row>(spec({ entityId: 't1' }))
    await mutate<Row>(spec({
      entityId: 't1',
      intent: { entityId: 't1', kind: 'tour', op: 'update', payload: { id: 't1', renamed: true } },
      current: [{ id: 't1', name: 'a' }],
      apply: rows => rows.map(r => ({ ...r, name: 'b' })),
    }))

    const all = await peekAllOrdered()
    expect(all).toHaveLength(1)
    expect(all[0].op).toBe('create') // create + update stays a create
    expect(all[0].payload).toEqual({ id: 't1', renamed: true }) // newer payload won
  })

  it('enqueues an update whose baseSnapshot is a live Vue reactive object (no DataCloneError)', async () => {
    // Regression: an update intent carries `baseSnapshot` straight off a store ref, and
    // the cache write-through persists the reactive collection — both are Proxy-backed and
    // throw DataCloneError under structured clone unless de-proxied. This is exactly the
    // offline-edit path (a create has no baseSnapshot, so it slipped through before).
    const rows = ref([reactive({ id: 't1', name: 'a' })])
    const existing = rows.value[0]

    await mutate<Row>(spec({
      entityId: 't1',
      intent: { entityId: 't1', kind: 'tour', op: 'update', payload: { id: 't1' }, baseSnapshot: existing },
      current: rows.value, // reactive array — the write-through must strip its reactivity too
      apply: rs => rs.map(r => ({ ...r, name: 'b' })),
    }))

    const stored = await getEntry('t1')
    expect(stored?.op).toBe('update')
    expect(stored?.baseSnapshot).toEqual({ id: 't1', name: 'a' }) // plain clone persisted
  })

  it('atomicity: a queue-put failure rolls back the cache write and is swallowed gracefully', async () => {
    sabotage.enabled = true
    const assign = vi.fn()

    // The IDB failure must NOT propagate — it's caught into the signal, not thrown at the caller.
    const outcome = await mutate<Row>(spec({ entityId: 't1', assign }))

    sabotage.enabled = false
    expect(outcome).toEqual({ queued: false, failed: true }) // failure reported, not a rejection
    expect(assign).not.toHaveBeenCalled() // ref left at pre-edit state (no phantom optimistic row)
    expect(offlineWriteError.value).toBe('offline.writeError.generic') // user-facing signal set
    expect(await getCached('tours:me')).toBeUndefined() // cache write rolled back with the tx
    expect(await getEntry('t1')).toBeUndefined() // queue write never committed
  })
})
