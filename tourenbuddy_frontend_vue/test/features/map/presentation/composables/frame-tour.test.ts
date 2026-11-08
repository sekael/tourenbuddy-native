import type { Map as MaplibreMap } from 'maplibre-gl'
import { LngLatBounds } from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { frameBounds, frameTours, GLIDE_MS, ROUTE_ZOOM, TOUR_ZOOM } from '@/features/map/presentation/composables/frame-tour'

const goal = { lng: 9.7, lat: 46.6 }
const start = { lng: 9.6, lat: 46.5 }
const end = { lng: 9.8, lat: 46.7 }

function fakeMap() {
  return {
    cameraForBounds: vi.fn(() => ({ center: [0, 0], zoom: 10 })),
    flyTo: vi.fn(),
    easeTo: vi.fn(),
    getBearing: () => 15,
    getZoom: () => 9,
    getCenter: () => ({ lng: 9.7, lat: 46.6 }),
    getContainer: () => ({ clientWidth: 400, clientHeight: 800, getBoundingClientRect: () => ({ width: 400, height: 800 }) }),
    // The target two screens off, unless a test brings it closer.
    project: vi.fn(() => ({ x: 200, y: 2000 })),
  }
}

function frame(tour: { startPoint: typeof start | null, endPoint: typeof end | null }, covered = {}) {
  const map = fakeMap()
  frameTours(map as unknown as MaplibreMap, [{ goal, ...tour }], covered)
  const [bounds, options] = map.cameraForBounds.mock.calls[0] as unknown as [{ toArray: () => number[][] }, any]
  return { map, box: bounds.toArray(), options }
}

describe('frameTours', () => {
  it('should frame a lone goal as a zero-size box, capped at the tour zoom', () => {
    const { box, options } = frame({ startPoint: null, endPoint: null })
    expect(box).toEqual([[goal.lng, goal.lat], [goal.lng, goal.lat]])
    expect(options.maxZoom).toBe(TOUR_ZOOM)
  })

  it('should frame a round trip (start = end) exactly like start and goal', () => {
    expect(frame({ startPoint: start, endPoint: start }).box)
      .toEqual(frame({ startPoint: start, endPoint: null }).box)
  })

  it('should frame every segment of an outing', () => {
    const map = fakeMap()
    frameTours(map as unknown as MaplibreMap, [
      { goal, startPoint: start, endPoint: null },
      { goal: end, startPoint: goal, endPoint: null },
    ], {})
    const [bounds] = map.cameraForBounds.mock.calls[0] as unknown as [{ toArray: () => number[][] }]
    expect(bounds.toArray()).toEqual([[start.lng, start.lat], [end.lng, end.lat]])
  })

  it('should stretch the box to a separate end point', () => {
    expect(frame({ startPoint: start, endPoint: end }).box).toEqual([[start.lng, start.lat], [end.lng, end.lat]])
  })

  it('should pad by the covered area and keep the bearing', () => {
    const { options } = frame({ startPoint: null, endPoint: null }, { bottom: 300 })
    expect(options.padding.bottom).toBeGreaterThan(300)
    expect(options.padding.top).toBeLessThan(300)
    expect(options.bearing).toBe(15)
  })

  it('should centre the goal when there is no room to frame in', () => {
    const map = fakeMap()
    map.cameraForBounds.mockReturnValue(undefined as never)
    frameTours(map as unknown as MaplibreMap, [{ goal, startPoint: start, endPoint: null }], { bottom: 5000 })
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [goal.lng, goal.lat], zoom: TOUR_ZOOM }))
  })

  it('should frame up to a raised max zoom but fall back no closer than the tour zoom', () => {
    const map = fakeMap()
    map.cameraForBounds.mockReturnValue(undefined as never)
    frameBounds(map as unknown as MaplibreMap, new LngLatBounds([start.lng, start.lat], [end.lng, end.lat]), {}, { maxZoom: ROUTE_ZOOM })
    expect((map.cameraForBounds.mock.calls[0] as unknown as [unknown, { maxZoom: number }])[1].maxZoom).toBe(ROUTE_ZOOM)
    expect(map.flyTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: TOUR_ZOOM }))
  })

  it('should glide to the next stage a screen away instead of zipping there in a blink', () => {
    const map = fakeMap()
    map.project.mockReturnValue({ x: 200, y: 1150 })
    frameTours(map as unknown as MaplibreMap, [{ goal, startPoint: null, endPoint: null }], {})
    expect(map.flyTo).not.toHaveBeenCalled()
    expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ zoom: 10, duration: GLIDE_MS }))
  })

  it('should fly, not glide, when the target in view is far more zoomed in', () => {
    const map = fakeMap()
    map.project.mockReturnValue({ x: 200, y: 400 })
    map.cameraForBounds.mockReturnValue({ center: [0, 0], zoom: 14 })
    frameTours(map as unknown as MaplibreMap, [{ goal, startPoint: null, endPoint: null }], {})
    expect(map.easeTo).not.toHaveBeenCalled()
    expect(map.flyTo).toHaveBeenCalledOnce()
  })

  it('should stay put for a tour already in view at about its zoom, like the next one of a stack', () => {
    const map = fakeMap()
    map.project.mockReturnValue({ x: 200, y: 400 })
    frameTours(map as unknown as MaplibreMap, [{ goal, startPoint: null, endPoint: null }], {})
    expect(map.easeTo).not.toHaveBeenCalled()
    expect(map.flyTo).not.toHaveBeenCalled()
  })

  it('should centre a tour in view that sits well off the middle', () => {
    const map = fakeMap()
    map.project.mockReturnValue({ x: 60, y: 400 })
    frameTours(map as unknown as MaplibreMap, [{ goal, startPoint: null, endPoint: null }], {})
    expect(map.easeTo).toHaveBeenCalledOnce()
  })

  it('should still frame a tour in view that the drawer covers', () => {
    const map = fakeMap()
    map.project.mockReturnValue({ x: 300, y: 400 })
    frameTours(map as unknown as MaplibreMap, [{ goal, startPoint: null, endPoint: null }], { right: 100 })
    expect(map.easeTo).toHaveBeenCalledOnce()
  })
})
