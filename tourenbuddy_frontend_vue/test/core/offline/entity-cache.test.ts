import { afterEach, describe, expect, it } from 'vitest'
import { clearCached, getCached, putCached } from '@/core/offline/entity-cache'
import 'fake-indexeddb/auto'

describe('entityCache', () => {
  afterEach(async () => {
    await clearCached('tours:a')
    await clearCached('tours:b')
  })

  it('resolves undefined for a key that was never written (no throw)', async () => {
    await expect(getCached('tours:never-written')).resolves.toBeUndefined()
  })

  it('isolates snapshots per key: writing tours:a does not affect tours:b', async () => {
    await putCached('tours:a', [{ id: 1 }])

    expect(await getCached('tours:b')).toBeUndefined()
    expect(await getCached('tours:a')).toEqual([{ id: 1 }])
  })

  it('overwrites a key in place rather than appending', async () => {
    await putCached('tours:a', ['first'])
    await putCached('tours:a', ['second'])

    expect(await getCached('tours:a')).toEqual(['second'])
  })
})
