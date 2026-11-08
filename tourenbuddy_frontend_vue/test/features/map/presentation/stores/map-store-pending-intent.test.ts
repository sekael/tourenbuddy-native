import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMapStore } from '@/features/map/presentation/stores/map-store'

describe('map-store pendingIntent', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns the stored intent then clears it (read exactly once)', () => {
    const store = useMapStore()
    store.setPendingIntent({ selectTourId: 't-1', origin: 'cal-planned' })

    expect(store.consumePendingIntent()).toEqual({ selectTourId: 't-1', origin: 'cal-planned' })
    // Second read is empty — a stale intent must not re-fire on the next mount.
    expect(store.consumePendingIntent()).toBeNull()
  })

  it('returns null when nothing was set', () => {
    const store = useMapStore()
    expect(store.consumePendingIntent()).toBeNull()
  })
})
