import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useMapStore } from '@/features/map/presentation/stores/map-store'

describe('useMapStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should start with default state', () => {
    const store = useMapStore()
    expect(store.isPickingLocation).toBe(false)
    expect(store.currentStyleIndex).toBe(0)
    expect(store.selectedTourId).toBeNull()
  })

  it('should enter location picking mode', () => {
    const store = useMapStore()
    store.setPickingLocation(true)
    expect(store.isPickingLocation).toBe(true)
  })

  it('should preserve selected tour when entering location picking mode', () => {
    const store = useMapStore()
    store.selectTour('tour-123')
    store.setPickingLocation(true)
    expect(store.selectedTourId).toBe('tour-123')
  })

  it('should exit location picking mode', () => {
    const store = useMapStore()
    store.setPickingLocation(true)
    store.setPickingLocation(false)
    expect(store.isPickingLocation).toBe(false)
  })

  it('should update style index', () => {
    const store = useMapStore()
    store.setStyleIndex(1)
    expect(store.currentStyleIndex).toBe(1)
  })

  it('should select a tour', () => {
    const store = useMapStore()
    store.selectTour('tour-abc')
    expect(store.selectedTourId).toBe('tour-abc')
  })

  it('should deselect a tour', () => {
    const store = useMapStore()
    store.selectTour('tour-abc')
    store.selectTour(null)
    expect(store.selectedTourId).toBeNull()
  })

  describe('preview marker state', () => {
    it('should start with no preview goal or type', () => {
      const store = useMapStore()
      expect(store.previewGoal).toBeNull()
      expect(store.previewTourTypes).toBeNull()
    })

    it('should clear the preview goal back to null', () => {
      const store = useMapStore()
      store.setPreviewGoal({ lng: 8.2, lat: 46.8 })
      store.setPreviewGoal(null)
      expect(store.previewGoal).toBeNull()
    })

    it('should clear the preview tour type back to null', () => {
      const store = useMapStore()
      store.setPreviewTourTypes(['skitour'])
      store.setPreviewTourTypes(null)
      expect(store.previewTourTypes).toBeNull()
    })

    it('should keep preview goal and type independent of tour selection', () => {
      const store = useMapStore()
      store.setPreviewGoal({ lng: 8.2, lat: 46.8 })
      store.setPreviewTourTypes(['hiking'])
      store.selectTour('tour-xyz')
      store.selectTour(null)
      expect(store.previewGoal).toEqual({ lng: 8.2, lat: 46.8 })
      expect(store.previewTourTypes).toEqual(['hiking'])
    })
  })
})

describe('useMapStore overlays', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  function storeWith(stored: string) {
    localStorage.setItem('tb.map.overlays', stored)
    setActivePinia(createPinia())
    return useMapStore()
  }

  it('should start with no overlays on corrupt JSON', () => {
    expect(storeWith('{not json').activeOverlays).toEqual([])
  })

  it('should drop unknown ids but keep known ones', () => {
    expect(storeWith('["ski","snowshoe"]').activeOverlays).toEqual(['ski'])
  })

  it('should start with no overlays when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    setActivePinia(createPinia())
    expect(useMapStore().activeOverlays).toEqual([])
  })

  it('should keep the toggle in memory when saving throws', async () => {
    setActivePinia(createPinia())
    const store = useMapStore()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded')
    })
    store.toggleOverlay('ski')
    await nextTick()
    expect(store.activeOverlays).toEqual(['ski'])
  })
})

describe('map store: outing overview vs segment (#338, D15)', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('should close the overview when a segment opens, and the segment when an overview opens', () => {
    const store = useMapStore()
    store.selectOuting('me/o1')
    store.selectTour('t1')
    expect([store.selectedOutingKey, store.selectedTourId]).toEqual([null, 't1'])
    store.selectOuting('me/o1')
    expect([store.selectedOutingKey, store.selectedTourId]).toEqual(['me/o1', null])
  })

  it('should leave the overview open when the tour selection is cleared', () => {
    const store = useMapStore()
    store.selectOuting('me/o1')
    store.selectTour(null)
    expect(store.selectedOutingKey).toBe('me/o1')
  })
})
