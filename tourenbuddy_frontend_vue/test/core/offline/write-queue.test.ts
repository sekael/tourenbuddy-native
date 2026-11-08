import type { WriteQueueEntry } from '@/core/offline/write-queue'
import { describe, expect, it } from 'vitest'
import { coalesce } from '@/core/offline/write-queue'

/**
 * The DC1 coalescing table as executable spec (task 10.1). `coalesce` is a pure
 * reducer — no IndexedDB, no clock — so these are plain in/out assertions. Focus is
 * the branches that lose or transform data: annihilate, keep-first baseline, and
 * the terminal delete.
 */

function entry(over: Partial<WriteQueueEntry>): WriteQueueEntry {
  return {
    entityId: 't1',
    kind: 'tour',
    op: 'update',
    payload: {},
    seq: 1,
    attempts: 0,
    ...over,
  }
}

describe('coalesce', () => {
  it('create + delete → annihilates (row never reached the server)', () => {
    const existing = entry({ op: 'create' })
    const incoming = entry({ op: 'delete' })
    expect(coalesce(existing, incoming)).toBeNull()
  })

  it('none + delete → tombstone (op=delete), NOT annihilate — a real server row must be deleted', () => {
    const incoming = entry({ op: 'delete' })
    expect(coalesce(undefined, incoming)?.op).toBe('delete')
  })

  it('create + update → keeps op=create with the newer full payload (no baseline)', () => {
    const existing = entry({ op: 'create', payload: { name: 'A' }, seq: 7 })
    const incoming = entry({ op: 'update', payload: { name: 'B' }, seq: 9 })
    const result = coalesce(existing, incoming)!
    expect(result.op).toBe('create')
    expect(result.payload).toEqual({ name: 'B' })
    expect(result.seq).toBe(7) // preserves the original insertion order
    expect(result.baseSnapshot).toBeUndefined() // a create has no server baseline
  })

  it('update + update → keeps the FIRST baseSnapshot / baseUpdatedAt', () => {
    const existing = entry({
      op: 'update',
      payload: { name: 'A' },
      baseSnapshot: { name: 'server' },
      baseUpdatedAt: '2026-01-01T00:00:00Z',
      seq: 3,
    })
    const incoming = entry({
      op: 'update',
      payload: { name: 'B' },
      baseSnapshot: { name: 'A' }, // the caller's later capture — MUST be discarded
      baseUpdatedAt: '2026-02-02T00:00:00Z',
      seq: 5,
    })
    const result = coalesce(existing, incoming)!
    expect(result.payload).toEqual({ name: 'B' })
    expect(result.baseSnapshot).toEqual({ name: 'server' })
    expect(result.baseUpdatedAt).toBe('2026-01-01T00:00:00Z')
    expect(result.seq).toBe(3)
  })

  it('update back to baseline → annihilates (toggle a field and toggle it back)', () => {
    const existing = entry({
      op: 'update',
      payload: { push: true, email: false },
      baseSnapshot: { push: false, email: false },
      seq: 4,
    })
    // Net payload equals the pre-edit server snapshot, key order differs → still annihilates.
    const incoming = entry({ op: 'update', payload: { email: false, push: false } })
    expect(coalesce(existing, incoming)).toBeNull()
  })

  it('update to a DIFFERENT value than baseline → still queued (no false annihilate)', () => {
    const existing = entry({
      op: 'update',
      payload: { push: true },
      baseSnapshot: { push: false },
    })
    expect(coalesce(existing, entry({ op: 'update', payload: { push: true } }))).not.toBeNull()
  })

  it('update + delete → tombstone (op=delete)', () => {
    const existing = entry({ op: 'update' })
    const incoming = entry({ op: 'delete' })
    expect(coalesce(existing, incoming)?.op).toBe('delete')
  })

  it('delete is terminal — a later create/update does not revive the entry', () => {
    const existing = entry({ op: 'delete', seq: 2 })
    expect(coalesce(existing, entry({ op: 'update' }))?.op).toBe('delete')
    expect(coalesce(existing, entry({ op: 'create' }))?.op).toBe('delete')
  })

  it('none + update → carries the incoming baseline through', () => {
    const incoming = entry({
      op: 'update',
      baseSnapshot: { name: 'server' },
      baseUpdatedAt: '2026-03-03T00:00:00Z',
    })
    const result = coalesce(undefined, incoming)!
    expect(result.op).toBe('update')
    expect(result.baseSnapshot).toEqual({ name: 'server' })
    expect(result.baseUpdatedAt).toBe('2026-03-03T00:00:00Z')
  })
})
