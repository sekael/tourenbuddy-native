import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPieMarkerElement, fadeIn, fadeOut } from '@/features/map/presentation/components/pie-marker'

// Minimal MapLibre stub with all events needed for the new cluster pipeline
function makeStubMap(individualFeatures: object[] = []) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  const layers: Record<string, { type?: string, paint?: Record<string, unknown>, filter?: unknown }> = {}
  const sources: Record<string, { type: string, setData: ReturnType<typeof vi.fn> }> = {}
  const container = {
    clientWidth: 400,
    clientHeight: 800,
    classList: document.createElement('div').classList,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
  }

  return {
    addSource: vi.fn((id: string, opts: { type: string }) => {
      sources[id] = { type: opts.type, setData: vi.fn() }
    }),
    getSource: vi.fn((id: string) => sources[id]),
    /** Last data set on a source. */
    sourceData: (id: string) => sources[id]?.setData.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection,
    addLayer: vi.fn((layer: { id: string, type?: string, paint?: Record<string, unknown> }, _beforeId?: string) => {
      layers[layer.id] = { type: layer.type, paint: layer.paint }
    }),
    getLayer: vi.fn((id: string) => layers[id] ?? null),
    setFilter: vi.fn((id: string, filter: unknown) => {
      if (layers[id])
        layers[id].filter = filter
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event])
        listeners[event] = []
      listeners[event].push(handler)
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      listeners[event] = (listeners[event] ?? []).filter(h => h !== handler)
    }),
    getCanvas: vi.fn(() => ({ style: {} })),
    setPaintProperty: vi.fn(),
    getPaintProperty: vi.fn((id: string, prop: string) => layers[id]?.paint?.[prop]),
    isSourceLoaded: vi.fn(() => true),
    triggerRepaint: vi.fn(),
    hasImage: vi.fn(() => true),
    addImage: vi.fn(),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    panBy: vi.fn(),
    getContainer: vi.fn(() => container),
    cameraForBounds: vi.fn((): { center: [number, number], zoom: number } | undefined => ({ center: [8.005, 47], zoom: 14 })),
    getZoom: vi.fn(() => 10),
    getMaxZoom: vi.fn(() => 22),
    getBounds: vi.fn(() => ({
      getWest: () => 7,
      getSouth: () => 46,
      getEast: () => 9,
      getNorth: () => 48,
    })),
    getCenter: vi.fn(() => ({ lng: 8, lat: 47 })),
    removeSource: vi.fn(),
    removeLayer: vi.fn(),
    project: vi.fn(() => ({ x: 100, y: 100 })),
    unproject: vi.fn(() => ({ lng: 8, lat: 47 })),
    querySourceFeatures: vi.fn((_id: string, opts?: { filter?: unknown[] }) => {
      const filter = opts?.filter
      if (Array.isArray(filter) && filter[0] === 'has' && filter[1] === 'point_count')
        return []
      return individualFeatures
    }),
    emit: (event: string, ...args: unknown[]) => {
      for (const handler of listeners[event] ?? [])
        handler(...args)
    },
  }
}

// Mock maplibre-gl Marker capturing the element
vi.mock('maplibre-gl', () => {
  // A plain class, not a `vi.fn`: `vi.restoreAllMocks` in a later suite would wipe its behaviour.
  const markerElements: HTMLElement[] = []
  class Marker {
    private el: HTMLElement
    constructor(opts: { element?: HTMLElement } = {}) {
      this.el = opts.element ?? document.createElement('div')
      markerElements.push(this.el)
    }

    setLngLat() { return this }
    setOffset() { return this }
    addTo() { return this }
    remove() {}
    getElement() { return this.el }
  }
  const popups: { content: HTMLElement | null }[] = []
  /** Where the opened list lands on the 400×800 stub map; tests move it off the visible area. */
  const popupRect = { left: 100, right: 300, top: 120, bottom: 400 }
  class Popup {
    content: HTMLElement | null = null
    constructor() { popups.push(this) }
    setLngLat() { return this }
    setDOMContent(node: HTMLElement) {
      this.content = node
      return this
    }

    addTo() { return this }
    getElement() {
      const el = document.createElement('div')
      el.getBoundingClientRect = () => ({ ...popupRect }) as DOMRect
      return el
    }

    on() { return this }
    remove() {}
  }
  return {
    default: { Marker, Popup },
    Marker,
    Popup,
    popups,
    popupRect,
    markerElements,
  }
})

describe('useToursMarkerLayer — setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not throw during setup with empty source', async () => {
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const stub = makeStubMap()
    const map = stub as unknown as import('maplibre-gl').Map
    const layer = useToursMarkerLayer(map, vi.fn(), () => 'Cluster of N tours')
    await expect(layer.setup()).resolves.not.toThrow()
  })

  it('should call cleanup without error when cache is empty', async () => {
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const stub = makeStubMap()
    const map = stub as unknown as import('maplibre-gl').Map
    const layer = useToursMarkerLayer(map, vi.fn(), () => 'Cluster of N tours')
    await layer.setup()
    expect(() => layer.cleanup()).not.toThrow()
  })

  it('should split only tours whose types span several colours', async () => {
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const { TOUR_FILL } = await import('../../../../fixtures/tour-fill')
    const stub = makeStubMap()
    const layer = useToursMarkerLayer(stub as unknown as import('maplibre-gl').Map, vi.fn(), () => '')
    await layer.setup()
    const tour = (id: string, tourTypes: string[]) => ({
      ...TOUR_FILL,
      id,
      tourTypes,
      goal: { lng: 8, lat: 47 },
      completed: false,
    }) as unknown as import('@/features/tours/domain/entities/tour').Tour

    layer.updateTours([tour('mixed', ['skitour', 'hiking']), tour('blue', ['skitour', 'splitboarding'])], null)

    const pie = Object.fromEntries(stub.sourceData('tours').features.map(f => [f.id, f.properties!.pieImage]))
    expect(pie).toEqual({ mixed: 'pie:#4338CA,#E11D48', blue: null })
  })

  it('should keep a focused outing\'s segments out of clusters and number them in order', async () => {
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const { TOUR_FILL } = await import('../../../../fixtures/tour-fill')
    const tour = (id: string) => ({
      ...TOUR_FILL,
      id,
      tourTypes: ['hiking'],
      goal: { lng: 8, lat: 47 },
      completed: false,
    }) as unknown as import('@/features/tours/domain/entities/tour').Tour
    /** Ids the unselected circle layer currently draws individually. */
    const drawn = (stub: ReturnType<typeof makeStubMap>) => {
      const filter = stub.setFilter.mock.calls.filter(([id]) => id === 'tours-circles').at(-1)![1]
      return JSON.stringify(filter).match(/"literal",\[(.*?)\]/)![1]
    }

    // Same spot: without focus the two collapse into one cluster.
    const plain = makeStubMap()
    const plainLayer = useToursMarkerLayer(plain as unknown as import('maplibre-gl').Map, vi.fn(), () => '')
    await plainLayer.setup()
    plainLayer.updateTours([tour('hut'), tour('summit')], null)
    expect(drawn(plain)).toBe('')

    const stub = makeStubMap()
    const layer = useToursMarkerLayer(stub as unknown as import('maplibre-gl').Map, vi.fn(), () => '')
    await layer.setup()
    layer.updateTours([tour('hut'), tour('summit'), tour('other')], null, new Set(), ['summit', 'hut'])

    // `other` is not part of the open outing, so it is off the map meanwhile (D15).
    expect(drawn(stub)).toBe('"summit","hut"')
    const badges = Object.fromEntries(stub.sourceData('tours').features.map(f => [f.id, f.properties!.segmentBadge]))
    expect(badges).toEqual({ hut: 'segment:2', summit: 'segment:1' })
  })

  it('should update selected filter on updateTours', async () => {
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const stub = makeStubMap()
    const map = stub as unknown as import('maplibre-gl').Map
    const layer = useToursMarkerLayer(map, vi.fn(), () => 'Cluster of N tours')
    await layer.setup()
    layer.updateTours([], 'tour-123')
    expect(map.setFilter).toHaveBeenCalledWith(
      'tours-circles-selected',
      expect.arrayContaining(['all']),
    )
  })

  it('should subscribe to move, moveend, zoom, zoomend, idle, zoomstart, movestart events', async () => {
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const stub = makeStubMap()
    const map = stub as unknown as import('maplibre-gl').Map
    const layer = useToursMarkerLayer(map, vi.fn(), () => 'Cluster')
    await layer.setup()

    const registeredEvents = (map.on as ReturnType<typeof vi.fn>).mock.calls.map(
      (args: unknown[]) => args[0],
    )
    expect(registeredEvents).toContain('move')
    expect(registeredEvents).toContain('moveend')
    expect(registeredEvents).toContain('zoom')
    expect(registeredEvents).toContain('zoomend')
    expect(registeredEvents).toContain('idle')
    expect(registeredEvents).toContain('zoomstart')
  })

  it('should not call querySourceFeatures with cluster filter for cluster sync', async () => {
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const stub = makeStubMap()
    const map = stub as unknown as import('maplibre-gl').Map
    const layer = useToursMarkerLayer(map, vi.fn(), () => 'Cluster')
    await layer.setup()

    stub.emit('move')
    stub.emit('moveend')
    stub.emit('idle')

    // querySourceFeatures must never be called with the cluster filter
    const calls = (map.querySourceFeatures as ReturnType<typeof vi.fn>).mock.calls
    const clusterCalls = calls.filter(
      (args: unknown[]) =>
        Array.isArray((args as [string, { filter?: unknown[] }])[1]?.filter)
        && (args as [string, { filter?: unknown[] }])[1]?.filter?.[1] === 'point_count',
    )
    expect(clusterCalls).toHaveLength(0)
  })

  it('should add source without cluster:true', async () => {
    vi.resetModules()
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const stub = makeStubMap()
    const map = stub as unknown as import('maplibre-gl').Map
    const layer = useToursMarkerLayer(map, vi.fn(), () => 'Cluster')
    await layer.setup()

    const tourSourceCall = (map.addSource as ReturnType<typeof vi.fn>).mock.calls.find(
      (args: unknown[]) => args[0] === 'tours',
    )
    expect(tourSourceCall).toBeDefined()
    expect((tourSourceCall as [string, Record<string, unknown>])[1]).not.toHaveProperty('cluster')
  })
})

describe('useToursMarkerLayer — reduced motion gate', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should not run animations when prefers-reduced-motion is set', async () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)

    vi.resetModules()
    const { useToursMarkerLayer } = await import(
      '@/features/map/presentation/components/tours-marker-layer'
    )
    const stub = makeStubMap()
    const map = stub as unknown as import('maplibre-gl').Map
    const layer = useToursMarkerLayer(map, vi.fn(), () => 'Cluster of N tours')
    await layer.setup()

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    stub.emit('zoomend')

    await new Promise(r => setTimeout(r, 10))

    expect(rafSpy).not.toHaveBeenCalled()
    matchMediaSpy.mockRestore()
  })
})

describe('opacity bridge — pie-marker', () => {
  it('should create pie marker element with opacity 0', () => {
    const el = createPieMarkerElement({ '#DC2626': 2 }, 2).element
    expect(el.style.opacity).toBe('0')
  })

  it('fadeIn should schedule opacity 1 via requestAnimationFrame', () => {
    const el = document.createElement('div')
    el.style.opacity = '0'
    el.style.transition = 'opacity 200ms ease'

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })

    fadeIn(el)

    expect(rafSpy).toHaveBeenCalled()
    expect(el.style.opacity).toBe('1')
    rafSpy.mockRestore()
  })

  it('fadeOut should set opacity 0 and call onDone on transitionend', () => {
    const el = document.createElement('div')
    el.style.opacity = '1'

    const onDone = vi.fn()
    fadeOut(el, onDone)

    expect(el.style.opacity).toBe('0')
    expect(onDone).not.toHaveBeenCalled()

    el.dispatchEvent(new Event('transitionend'))
    expect(onDone).toHaveBeenCalledOnce()
  })
})

describe('overflow', () => {
  it('should pan a span off the top down by the overrun, and centre one too big to fit', async () => {
    const { overflow } = await import('@/features/map/presentation/components/tours-marker-layer')
    expect(overflow(40, 300, 64, 688)).toBe(40 - 64)
    expect(overflow(0, 900, 64, 688)).toBe((0 + 900 - 64 - 688) / 2)
  })
})

describe('useToursMarkerLayer — selection, labels and cluster taps', () => {
  async function setupLayer(covered: { right?: number, bottom?: number } = {}) {
    vi.resetModules()
    const maplibre = await import('maplibre-gl') as unknown as { markerElements: HTMLElement[], popups: { content: HTMLElement | null }[], popupRect: Record<string, number> }
    maplibre.markerElements.length = 0
    maplibre.popups.length = 0
    Object.assign(maplibre.popupRect, { left: 100, right: 300, top: 120, bottom: 400 })
    const { useToursMarkerLayer } = await import('@/features/map/presentation/components/tours-marker-layer')
    const { TOUR_FILL } = await import('../../../../fixtures/tour-fill')
    const stub = makeStubMap()
    const onTourClick = vi.fn()
    const layer = useToursMarkerLayer(stub as unknown as import('maplibre-gl').Map, onTourClick, () => '', {
      describeTour: tour => ({ name: tour.name ?? 'Unnamed', sub: tour.completed ? 'Done' : 'No date' }),
      stackTitle: count => `${count} tours here`,
      clusterSummary: ({ total, planned, undated, done }) => `${total}: ${planned} planned, ${undated} undated, ${done} done`,
    }, () => covered)
    await layer.setup()
    const tour = (id: string, lng: number, extra: object = {}) => ({
      ...TOUR_FILL,
      id,
      name: id,
      tourTypes: ['hiking'],
      goal: { lng, lat: 47 },
      completed: false,
      ...extra,
    }) as unknown as import('@/features/tours/domain/entities/tour').Tour
    /** The DOM element of each cluster marker created so far. */
    const clusterElements = () => maplibre.markerElements
    return { stub, layer, tour, onTourClick, clusterElements, popups: maplibre.popups, popupRect: maplibre.popupRect }
  }

  it('should draw the selected tour on its own beside the cluster it sat in', async () => {
    const { stub, layer, tour } = await setupLayer()
    layer.updateTours([tour('a', 8), tour('b', 8), tour('c', 8)], 'b')
    const filter = stub.setFilter.mock.calls.filter(([id]) => id === 'tours-circles-selected').at(-1)![1]
    expect(JSON.stringify(filter)).toContain('"literal",["b"]')
  })

  it('should give each feature its label lines and activity glyph', async () => {
    const { stub, layer, tour } = await setupLayer()
    layer.updateTours([tour('done', 8, { completed: true }), tour('untyped', 9, { tourTypes: [] })], null)
    const props = Object.fromEntries(stub.sourceData('tours').features.map(f => [f.id, f.properties]))
    expect(props.done).toMatchObject({ label: 'done', labelSub: 'Done', activityImage: 'activity:hiking' })
    expect(props.untyped).not.toHaveProperty('activityImage')
  })

  it('should frame a spread cluster\'s tours in one tap when that zooms past its split', async () => {
    const { stub, layer, tour, clusterElements } = await setupLayer()
    layer.updateTours([tour('a', 8.0), tour('b', 8.01)], null)
    clusterElements()[0]!.click()
    expect(stub.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [8.005, 47], zoom: 14 }))
  })

  it('should not frame a cluster closer than street-overview zoom when its split allows', async () => {
    const { stub, layer, tour, clusterElements } = await setupLayer()
    stub.cameraForBounds.mockReturnValue({ center: [8.005, 47], zoom: 18.2 })
    layer.updateTours([tour('a', 8.0), tour('b', 8.01)], null)
    clusterElements()[0]!.click()
    expect((stub.flyTo.mock.calls[0]![0] as { zoom: number }).zoom).toBe(15.5)
  })

  it('should still zoom past the split when the fitted zoom falls short of it', async () => {
    const { stub, layer, tour, clusterElements } = await setupLayer()
    stub.cameraForBounds.mockReturnValue({ center: [8.005, 47], zoom: 10.5 })
    layer.updateTours([tour('a', 8.0), tour('b', 8.01)], null)
    clusterElements()[0]!.click()
    const { zoom } = stub.flyTo.mock.calls[0]![0] as { zoom: number }
    expect(zoom).toBeGreaterThan(12.5)
  })

  it('should zoom in at least a level, gliding, when framing a wide cluster barely zooms', async () => {
    const { stub, layer, tour, clusterElements } = await setupLayer()
    stub.getZoom.mockReturnValue(5.5)
    stub.cameraForBounds.mockReturnValue({ center: [8.5, 47], zoom: 5.6 })
    layer.updateTours([tour('a', 8.0), tour('b', 9.0)], null)
    clusterElements()[0]!.click()
    // A level in on screen: a flight would take under half a second (D21).
    expect(stub.flyTo).not.toHaveBeenCalled()
    expect(stub.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 6.5, duration: 1000 }))
  })

  it('should list a same-spot stack instead of moving the map, and select from it', async () => {
    const { stub, layer, tour, clusterElements, popups, onTourClick } = await setupLayer()
    layer.updateTours([tour('a', 8), tour('b', 8)], null)
    clusterElements()[0]!.click()
    expect(stub.flyTo).not.toHaveBeenCalled()
    expect(stub.panBy).not.toHaveBeenCalled()
    const content = popups.at(-1)!.content!
    expect(content.querySelector('h3')!.textContent).toBe('2 tours here')
    content.querySelector<HTMLButtonElement>('.stack-list__row')!.click()
    expect(onTourClick).toHaveBeenCalledWith('a')
  })

  it('should show only the open tour, or the open outing\'s segments, until it closes', async () => {
    const { stub, layer, tour, clusterElements } = await setupLayer()
    const all = [tour('a', 8), tour('b', 8), tour('c', 8.5), tour('d', 9)]
    const shown = () => stub.sourceData('tours').features.map(f => f.id)
    layer.updateTours(all, 'b')
    expect(shown()).toEqual(['b'])
    expect(clusterElements().filter(el => el.className !== 'selection-stack-chip')).toHaveLength(0)
    layer.updateTours(all, null, new Set(), ['c', 'd'])
    expect(shown()).toEqual(['c', 'd'])
    layer.updateTours(all, null)
    expect(shown()).toHaveLength(4)
  })

  it('should keep showing every tour when the selected one has no marker of its own', async () => {
    const { stub, layer, tour } = await setupLayer()
    layer.updateTours([tour('a', 8), tour('b', 9)], 'not-on-map')
    expect(stub.sourceData('tours').features).toHaveLength(2)
  })

  it('should frame a tapped cluster\'s tours in the middle half of the area beside the drawer', async () => {
    const { stub, layer, tour, clusterElements } = await setupLayer({ right: 80 })
    layer.updateTours([tour('a', 8.0), tour('b', 8.01)], null)
    clusterElements()[0]!.click()
    // Stub map 400×800: a quarter of the 320 px beside the drawer, a quarter of the height.
    expect(stub.cameraForBounds).toHaveBeenCalledWith(expect.anything(), { padding: { top: 200, right: 160, bottom: 200, left: 80 } })
  })

  it('should shift a cluster zoomed by a level into the area beside the drawer', async () => {
    const { stub, layer, tour, clusterElements } = await setupLayer({ right: 400 })
    stub.getZoom.mockReturnValue(5.5)
    stub.cameraForBounds.mockReturnValue({ center: [8.5, 47], zoom: 5.6 })
    layer.updateTours([tour('a', 8.0), tour('b', 9.0)], null)
    clusterElements()[0]!.click()
    expect(stub.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 6.5, offset: [-200, 0] }))
  })

  it('should pan a stack list only as far as it runs under the tour bar', async () => {
    const { stub, layer, tour, clusterElements, popupRect } = await setupLayer()
    Object.assign(popupRect, { top: 300, bottom: 750 })
    layer.updateTours([tour('a', 8), tour('b', 8)], null)
    clusterElements()[0]!.click()
    // Stub map 800 px tall, 112 px kept clear below.
    expect(stub.panBy.mock.calls[0]![0]).toEqual([0, 750 - 688])
  })

  it('should pan a stack list out from under the drawer', async () => {
    const { stub, layer, tour, clusterElements, popupRect } = await setupLayer({ right: 200 })
    Object.assign(popupRect, { left: 150, right: 330 })
    layer.updateTours([tour('a', 8), tour('b', 8)], null)
    clusterElements()[0]!.click()
    expect(stub.panBy.mock.calls[0]![0]).toEqual([330 - (400 - 208), 0])
  })

  it('should count the others at the selected tour\'s spot on a chip that lists them all', async () => {
    const { layer, tour, clusterElements, popups } = await setupLayer()
    layer.updateTours([tour('a', 8), tour('b', 8), tour('c', 8), tour('far', 9)], 'b')
    const chip = clusterElements().find(el => el.className === 'selection-stack-chip')!
    expect(chip.textContent).toBe('+2')
    chip.click()
    const rows = [...popups.at(-1)!.content!.querySelectorAll('.stack-list__name')].map(r => r.textContent)
    expect(rows.sort()).toEqual(['a', 'b', 'c'])
  })

  it('should repaint a kept cluster whose tour changed activity', async () => {
    const { layer, tour, clusterElements } = await setupLayer()
    layer.updateTours([tour('a', 8), tour('b', 8)], null)
    layer.updateTours([tour('a', 8), tour('b', 8, { tourTypes: ['skitour'] })], null)
    expect(clusterElements()).toHaveLength(1)
    expect(clusterElements()[0]!.innerHTML.toUpperCase()).toContain('#4338CA')
  })

  it('should name a cluster by its status split, for season planning at a glance', async () => {
    const { layer, tour, clusterElements } = await setupLayer()
    layer.updateTours([
      tour('dated', 8, { plannedDate: new Date('2027-03-01') }),
      tour('undated', 8),
      tour('done', 8, { completed: true, plannedDate: new Date('2026-01-01') }),
    ], null)
    expect(clusterElements()[0]!.title).toBe('3: 1 planned, 1 undated, 1 done')
    expect(clusterElements()[0]!.getAttribute('aria-label')).toBe('3: 1 planned, 1 undated, 1 done')
  })

  it('should not let a cluster tap bubble into the map as a background tap', async () => {
    const { layer, tour, clusterElements } = await setupLayer()
    layer.updateTours([tour('a', 8), tour('b', 8)], null)
    const canvasContainer = document.createElement('div')
    const mapClick = vi.fn()
    canvasContainer.addEventListener('click', mapClick)
    canvasContainer.append(clusterElements()[0]!)
    clusterElements()[0]!.click()
    expect(mapClick).not.toHaveBeenCalled()
  })

  it('should not resend the clusters\' footprints on a pan that keeps the same clusters', async () => {
    const { stub, layer, tour } = await setupLayer()
    layer.updateTours([tour('a', 8), tour('b', 8)], null)
    const spots = () => stub.getSource('tours-cluster-spots')!.setData.mock.calls
    expect(spots().at(-1)![0].features).toHaveLength(1)
    const sent = spots().length
    stub.emit('move')
    expect(spots()).toHaveLength(sent)
  })

  it('should place names below the footprints, so they yield to markers', async () => {
    const { stub } = await setupLayer()
    const order = stub.addLayer.mock.calls.map(([l, before]) => [(l as { id: string }).id, before])
    expect(order).toContainEqual(['tours-labels', 'tour-detail-label'])
    expect(order.slice(-2).map(([id]) => id)).toEqual(['tours-cluster-spots', 'tour-detail-spots'])
  })
})

describe('useToursMarkerLayer — scene swap', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function setupScene() {
    const { useToursMarkerLayer } = await import('@/features/map/presentation/components/tours-marker-layer')
    const stub = makeStubMap()
    const layer = useToursMarkerLayer(stub as unknown as import('maplibre-gl').Map, vi.fn(), () => '')
    await layer.setup()
    const opacity = (id: string) => stub.setPaintProperty.mock.calls.filter(([l, p]) => l === id && p === 'circle-opacity').at(-1)?.[2]
    const hidden = () => stub.getContainer().classList.contains('tours-scene-hidden')
    return { stub, layer, opacity, hidden }
  }

  it('should draw only the latest scene when a switch comes during the fade-out', async () => {
    const { layer } = await setupScene()
    const first = vi.fn()
    const second = vi.fn()
    layer.swapScene(first)
    vi.advanceTimersByTime(100)
    layer.swapScene(second)
    vi.advanceTimersByTime(200)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('should keep the new scene hidden until its tours have drawn', async () => {
    const { stub, layer, opacity, hidden } = await setupScene()
    const fade = vi.fn()
    stub.isSourceLoaded.mockReturnValue(false)
    layer.swapScene(vi.fn(), fade)
    vi.advanceTimersByTime(200)
    stub.emit('render')
    expect(opacity('tours-circles')).toBe(0)
    expect(hidden()).toBe(true)
    stub.isSourceLoaded.mockReturnValue(true)
    stub.emit('render')
    expect(opacity('tours-circles')).toBe(0.9)
    expect(hidden()).toBe(false)
    expect(fade.mock.calls).toEqual([[false], [true]])
  })

  it('should fade the scene back in after a second when its sources never report drawn', async () => {
    const { stub, layer, hidden } = await setupScene()
    stub.isSourceLoaded.mockReturnValue(false)
    layer.swapScene(vi.fn())
    vi.advanceTimersByTime(1199)
    expect(hidden()).toBe(true)
    vi.advanceTimersByTime(1)
    expect(hidden()).toBe(false)
  })

  it('should not fade in a scene a newer switch replaced after it was drawn', async () => {
    const { stub, layer, hidden } = await setupScene()
    stub.isSourceLoaded.mockReturnValue(false)
    layer.swapScene(vi.fn())
    vi.advanceTimersByTime(200)
    layer.swapScene(vi.fn())
    stub.isSourceLoaded.mockReturnValue(true)
    stub.emit('render')
    expect(hidden()).toBe(true)
  })
})

describe('chainArc', () => {
  it('should run from one goal to the next, bowed off the straight line', async () => {
    const { chainArc } = await import('@/features/map/presentation/components/tours-marker-layer')
    const arc = chainArc([8, 46], [8.1, 46])
    expect(arc[0]).toEqual([8, 46])
    expect(arc.at(-1)![0]).toBeCloseTo(8.1)
    expect(arc.at(-1)![1]).toBeCloseTo(46)
    expect(Math.abs(arc[8]![1] - 46)).toBeGreaterThan(0.005)
  })
})
