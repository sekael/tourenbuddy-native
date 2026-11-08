import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TourAttachmentsStrip from '@/features/tours/presentation/components/tour-attachments-strip.vue'
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store'

/** One pinia across mounts — remounting the strip must not reset the store under test. */
function setup(seeded: unknown) {
  const pinia = createTestingPinia({ createSpy: vi.fn })
  const store = useTourAttachmentsStore(pinia)
  store.attachmentsByTour = { t1: seeded } as never

  const mountStrip = () => mount(TourAttachmentsStrip, {
    props: { tourId: 't1' },
    global: { plugins: [pinia], stubs: { BaseIcon: true } },
  })

  return { store, mountStrip }
}

describe('tourAttachmentsStrip', () => {
  it('refetches on remount even when the tour is already in the store', () => {
    // The strip unmounts on every info-sheet branch switch (suggestion review, edit), which
    // also clears the store's realtime target — so a row inserted while away reaches the
    // list ONLY through this refetch. A load-once guard here needed a full page reload.
    const { store, mountStrip } = setup([{ id: 'a1' }])

    mountStrip().unmount()
    mountStrip()

    expect(store.load).toHaveBeenCalledTimes(2)
  })

  it('refetches for a tour whose cached list is empty, not just a missing key', () => {
    const { store, mountStrip } = setup([])

    mountStrip()

    expect(store.load).toHaveBeenCalledWith('t1')
  })
})
