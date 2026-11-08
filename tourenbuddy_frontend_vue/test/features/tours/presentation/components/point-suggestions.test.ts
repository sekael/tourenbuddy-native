import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOnline } from '@/core/offline/use-online-status'
import PointSuggestions from '@/features/tours/presentation/components/point-suggestions.vue'

const { mockFindStopsNear } = vi.hoisted(() => ({ mockFindStopsNear: vi.fn() }))
vi.mock('@/features/tours/data/services/swisstopo-stop-service', () => ({ findStopsNear: mockFindStopsNear }))

const GOAL = { lng: 8.4551, lat: 46.6989 }
const STOP = { name: 'Steingletscher, Susten', lng: 8.4275, lat: 46.7311, distance: 4200 }
const PASS = { name: 'Susten Passhöhe', lng: 8.4466, lat: 46.7291, distance: 3400 }
const HUT = { lng: 8.43, lat: 46.71 }

function tour(id: string, over: Record<string, unknown>) {
  return { id, goal: GOAL, tourTypes: [], legs: null, startPoint: null, startPointName: null, endPoint: null, endPointName: null, updatedAt: '2026-01-01', ...over }
}

function mountSuggestions(props: Record<string, unknown>, tours: unknown[] = []) {
  return mount(PointSuggestions, {
    props: { role: 'start', around: GOAL, ...props },
    global: { plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { tours: { tours } } })] },
  })
}

function names(wrapper: ReturnType<typeof mountSuggestions>) {
  return wrapper.findAll('[data-testid=point-suggestion] .name').map(n => n.text())
}

describe('pointSuggestions', () => {
  beforeEach(() => {
    isOnline.value = true
    mockFindStopsNear.mockReset().mockResolvedValue([PASS, STOP])
  })
  afterEach(() => {
    isOnline.value = true
  })

  it('should put the latest own start for this goal first, then the nearest stops, at most three', async () => {
    const wrapper = mountSuggestions({}, [
      tour('old', { startPoint: { lng: 8.40, lat: 46.73 }, startPointName: 'Gadmen', updatedAt: '2025-01-01' }),
      tour('new', { startPoint: HUT, startPointName: 'Tierberglihütte SAC', updatedAt: '2026-06-01' }),
      tour('elsewhere', { goal: { lng: 7.9, lat: 46.5 }, startPoint: HUT, startPointName: 'Somewhere' }),
    ])
    await flushPromises()
    expect(names(wrapper)).toEqual(['Tierberglihütte SAC', 'Susten Passhöhe', 'Steingletscher, Susten'])
  })

  it('should not suggest the edited tour\'s own start, nor the start as its end', async () => {
    const wrapper = mountSuggestions(
      { role: 'end', exclude: { lng: STOP.lng, lat: STOP.lat }, tourId: 'self' },
      [tour('self', { endPoint: HUT, endPointName: 'Tierberglihütte SAC' })],
    )
    await flushPromises()
    expect(names(wrapper)).toEqual(['Susten Passhöhe'])
  })

  it('should not offer a stop at the goal as a start, but as an end (the ride down)', async () => {
    mockFindStopsNear.mockResolvedValue([{ name: 'Rothorn Gipfel', lng: GOAL.lng, lat: GOAL.lat, distance: 200 }, PASS])
    const start = mountSuggestions({})
    const end = mountSuggestions({ role: 'end' })
    await flushPromises()
    expect(names(start)).toEqual(['Susten Passhöhe'])
    expect(names(end)).toEqual(['Rothorn Gipfel', 'Susten Passhöhe'])
  })

  it('should offer a landing only the earlier landings, never the stops around the summit', async () => {
    const wrapper = mountSuggestions({ role: 'end', landing: true }, [
      tour('hike', { endPoint: STOP, endPointName: 'Steingletscher', updatedAt: '2026-02-01' }),
      tour('flight', { tourTypes: ['paragliding'], endPoint: HUT, endPointName: 'Landeplatz Brienz' }),
    ])
    await flushPromises()
    expect(names(wrapper)).toEqual(['Landeplatz Brienz'])
    expect(mockFindStopsNear).not.toHaveBeenCalled()
  })

  it('should emit the suggestion as a named pick', async () => {
    const wrapper = mountSuggestions({})
    await flushPromises()
    await wrapper.find('[data-testid=point-suggestion]').trigger('click')
    expect(wrapper.emitted('pick')![0]).toEqual([{ location: { lng: PASS.lng, lat: PASS.lat }, name: 'Susten Passhöhe' }])
  })

  it('should show nothing offline or when the lookup fails, without an error', async () => {
    isOnline.value = false
    const offline = mountSuggestions({})
    await flushPromises()
    expect(mockFindStopsNear).not.toHaveBeenCalled()
    expect(offline.find('[data-testid=start-suggestions]').exists()).toBe(false)

    isOnline.value = true
    mockFindStopsNear.mockRejectedValue(new Error('HTTP 500'))
    const failed = mountSuggestions({})
    await flushPromises()
    expect(failed.find('[data-testid=start-suggestions]').exists()).toBe(false)
  })
})
