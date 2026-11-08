import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoutePlanner from '@/features/map/presentation/components/route-planner.vue'

const { mockGetElevation, mockSuggestTourName, mockLoad } = vi.hoisted(() => ({ mockGetElevation: vi.fn(), mockSuggestTourName: vi.fn(), mockLoad: vi.fn() }))
vi.mock('@/features/tours/data/services/swisstopo-elevation-service', () => ({ getElevation: mockGetElevation }))
vi.mock('@/features/tours/data/services/swisstopo-name-service', () => ({ suggestTourName: mockSuggestTourName }))
vi.mock('@/features/tours/data/services/swisstopo-profile-service', () => ({ getTrackProfile: vi.fn().mockResolvedValue(null) }))
vi.mock('@/features/map/data/services/trail-network-service', () => ({ loadNetworkLines: mockLoad, TooFarError: class extends Error {} }))
// A phone: the panel is a sheet that folds.
vi.mock('@/core/composables/use-is-desktop', async () => {
  const { ref } = await import('vue')
  return { useIsDesktop: () => ref(false) }
})

const pt = (x: number, y: number) => ({ x, y, dist: (o: { x: number, y: number }) => Math.hypot(o.x - x, o.y - y) })
/** On screen at 10 000 px a degree: the points and handles lie far apart. */
const px = (p: readonly number[] | { lng: number, lat: number }) => ('lng' in p ? pt(p.lng * 1e4, p.lat * 1e4) : pt(p[0]! * 1e4, p[1]! * 1e4))

function fakeMap() {
  const handlers: Record<string, (e: unknown) => void> = {}
  const sources = new Set<string>()
  return {
    handlers,
    on: (event: string, fn: (e: unknown) => void) => (handlers[event] = fn),
    off: vi.fn(),
    project: px,
    getSource: (id: string) => (sources.has(id) ? { setData: vi.fn() } : undefined),
    addSource: (id: string) => sources.add(id),
    removeSource: (id: string) => sources.delete(id),
    getLayer: () => undefined,
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    getBearing: () => 0,
    cameraForBounds: () => undefined,
    easeTo: vi.fn(),
    getCanvas: () => ({ style: {} }),
    getContainer: () => document.createElement('div'),
    getCenter: () => ({ lng: 8, lat: 46 }),
    getZoom: () => 12,
    doubleClickZoom: { disable: vi.fn(), enable: vi.fn() },
    flyTo: vi.fn(),
    jumpTo: vi.fn(),
  }
}

function mountPlanner(props: Record<string, unknown> = {}) {
  const map = fakeMap()
  const wrapper = mount(RoutePlanner, {
    props: { map, initial: { start: null, goal: null, end: null }, step: 'start', title: 'New tour', doneLabel: 'Continue', ...props },
    global: { plugins: [createTestingPinia({ createSpy: vi.fn })], stubs: { Teleport: true } },
  })
  const tap = (lng: number, lat: number, point = { x: 0, y: 0 }) => map.handlers.click!({ point, lngLat: { lng, lat } })
  /** A press at `from` dragged to `to` and let go, as a mouse does it. */
  const drag = (from: [number, number], to: [number, number]) => {
    const event = (at: [number, number]) => ({ point: px(at), lngLat: { lng: at[0], lat: at[1] }, originalEvent: {}, preventDefault: vi.fn() })
    map.handlers.mousedown!(event(from))
    map.handlers.mousemove!(event(to))
    map.handlers.mouseup!({})
  }
  return { wrapper, map, tap, drag }
}

const lastPoints = (wrapper: ReturnType<typeof mountPlanner>['wrapper']) => (wrapper.emitted('change')!.at(-1) as [Record<string, { name: string | null } | null>])[0]

beforeEach(() => {
  // No ways around unless a test lays some: every leg goes straight.
  mockLoad.mockReset().mockResolvedValue({ key: 'none', lines: [] })
})

describe('routePlanner', () => {
  it('should set no point on a tap the page takes (a marked ski route)', async () => {
    const { wrapper, tap } = mountPlanner({ routeHit: () => true })
    tap(8.1, 46.1)
    await flushPromises()
    expect(lastPoints(wrapper).start).toBeNull()
  })

  it('should not continue without a goal', () => {
    const { wrapper } = mountPlanner()
    expect(wrapper.find('[data-testid=planner-done]').attributes('disabled')).toBeDefined()
  })

  it('should keep the newer place\'s name when the first lookup answers late', async () => {
    let answerFirst: (name: string) => void = () => {}
    mockSuggestTourName.mockReset()
      .mockImplementationOnce(() => new Promise(resolve => (answerFirst = resolve)))
      .mockResolvedValueOnce('Second')
    mockGetElevation.mockResolvedValue(1500)
    const { wrapper, tap } = mountPlanner({ step: 'goal' })

    tap(8.1, 46.1)
    await wrapper.find('[data-testid=planner-step-goal]').trigger('click')
    tap(8.2, 46.2)
    await flushPromises()
    answerFirst('First')
    await flushPromises()

    expect(lastPoints(wrapper).goal).toMatchObject({ name: 'Second', location: { lng: 8.2, lat: 46.2 } })
  })

  it('should make a round trip end where the start is, with its name and height', async () => {
    const start = { location: { lng: 8.1, lat: 46.1 }, name: 'Engelberg', elevation: 1002, loading: false }
    const goal = { location: { lng: 8.2, lat: 46.2 }, name: 'Titlis', elevation: 3238, loading: false }
    const { wrapper } = mountPlanner({ initial: { start, goal, end: null }, step: 'end', follow: false })

    await wrapper.find('[data-testid=planner-roundTrip]').trigger('click')

    expect(lastPoints(wrapper).end).toEqual(start)
    expect(wrapper.find('[data-testid=planner-climb]').text()).toContain('2236')
  })

  it('should ask before × drops a planned route with no form behind it, and keep it on Keep', async () => {
    const goal = { location: { lng: 8.2, lat: 46.2 }, name: 'Titlis', elevation: 3238, loading: false }
    const { wrapper } = mountPlanner({ initial: { start: null, goal, end: null }, step: 'end' })
    await wrapper.find('[data-testid=planner-cancel]').trigger('click')
    expect(wrapper.emitted('cancel')).toBeUndefined()
    await wrapper.find('[data-testid=planner-discard-keep]').trigger('click')
    expect(wrapper.find('[data-testid=planner-discard]').exists()).toBe(false)

    await wrapper.find('[data-testid=planner-cancel]').trigger('click')
    await wrapper.find('[data-testid=planner-discard-confirm]').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('should leave the route step on Escape', async () => {
    const { wrapper } = mountPlanner()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})

describe('routePlanner — a handed-over start', () => {
  it('should name a start it was handed unnamed (the last day\'s goal), as a new point', async () => {
    mockSuggestTourName.mockReset().mockResolvedValue('Cabane des Dix')
    mockGetElevation.mockResolvedValue(2928)
    const start = { location: { lng: 7.4, lat: 46.0 }, name: null, elevation: 2928, loading: true }
    const { wrapper } = mountPlanner({ initial: { start, goal: null, end: null }, step: 'goal' })
    await flushPromises()
    expect(lastPoints(wrapper).start).toMatchObject({ name: 'Cabane des Dix', loading: false })
  })
})

describe('routePlanner — the route is the track', () => {
  const point = (lng: number, lat: number, name: string) => ({ location: { lng, lat }, name, elevation: 1000, loading: false })
  const S = point(8.1, 46.7, 'Engelberg')
  const G = point(8.2, 46.8, 'Jochpass')
  const E = point(8.3, 46.75, 'Engstlenalp')
  const ll = (p: typeof S): [number, number] => [p.location.lng, p.location.lat]
  const V: [number, number] = [8.15, 46.76]
  /** A drawing through a point on the way up, each leg with a bend of its own. */
  const drawing = {
    points: [ll(S), V, ll(G), ll(E)],
    legs: [[ll(S), [8.12, 46.74], V], [V, [8.17, 46.79], ll(G)], [ll(G), [8.25, 46.78], ll(E)]] as [number, number][][],
    goal: 2,
  }
  const plan = (wrapper: ReturnType<typeof mountPlanner>['wrapper'], event = 'done') => (wrapper.emitted(event)!.at(-1) as [{ track: unknown }])[0]

  it('should hand on a drawing it was given as it was, its point on the way up kept', async () => {
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: E }, step: 'goal', track: drawing })
    await flushPromises()
    await wrapper.find('[data-testid=planner-done]').trigger('click')
    expect(plan(wrapper).track).toEqual(drawing)
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('should go back the way up on a round trip, through its point between, routing nothing', async () => {
    const up = { points: drawing.points.slice(0, 3), legs: drawing.legs.slice(0, 2), goal: 2 }
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end', track: up })
    await wrapper.find('[data-testid=planner-roundTrip]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid=planner-done]').trigger('click')
    const back = [...up.legs].reverse().map(leg => [...leg].reverse())
    expect(plan(wrapper).track).toEqual({ points: [ll(S), V, ll(G), V, ll(S)], legs: [...up.legs, ...back], goal: 2 })
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('should drop the way up\'s points with the start, and set off at the goal', async () => {
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: E }, step: 'start', track: drawing })
    await wrapper.find('[data-testid=planner-remove-start]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid=planner-done]').trigger('click')
    expect(plan(wrapper).track).toEqual({ points: [ll(G), ll(E)], legs: [drawing.legs[2]], goal: 0 })
  })

  it('should hand on no track, and draw no line, once switched to straight lines', async () => {
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end', track: drawing })
    await wrapper.find('[data-testid=planner-follow-switch]').trigger('click')
    await wrapper.find('[data-testid=planner-done]').trigger('click')
    expect(plan(wrapper).track).toBeNull()
    expect(wrapper.emitted('line')!.at(-1)).toEqual([null])
  })

  it('should wait for a leg still loading before it goes on, and hand on that leg', async () => {
    let answer: (value: unknown) => void = () => {}
    mockLoad.mockReset().mockReturnValue(new Promise(resolve => (answer = resolve)))
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end', canAddDay: true })
    await wrapper.find('[data-testid=planner-next-day]').trigger('click')
    expect(wrapper.emitted('nextDay')).toBeUndefined()

    answer({ key: 'none', lines: [] })
    await flushPromises()
    expect(plan(wrapper, 'nextDay').track).toEqual({ points: [ll(S), ll(G)], legs: [[ll(S), ll(G)]], goal: 1 })
  })

  it('should say so when no way leads along a leg, though it follows the ways', async () => {
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end' })
    await flushPromises()
    expect(wrapper.find('[data-testid=planner-follow]').text()).toBe('map.plan.follow.gap')
  })

  it('should go back to the form, not out of the tour, with a form behind it', async () => {
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end', back: true })
    const back = wrapper.find('[data-testid=planner-cancel]')
    expect(back.attributes('aria-label')).toBe('map.plan.back')
    await back.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })
})

describe('routePlanner — shaping the line (D13)', () => {
  const S = { location: { lng: 8.1, lat: 46.7 }, name: 'Engelberg', elevation: 1000, loading: false }
  const G = { location: { lng: 8.2, lat: 46.8 }, name: 'Jochpass', elevation: 2200, loading: false }
  const [s, g]: [number, number][] = [[8.1, 46.7], [8.2, 46.8]]
  const V: [number, number] = [8.13, 46.78]
  const plan = (wrapper: ReturnType<typeof mountPlanner>['wrapper']) => (wrapper.emitted('done')!.at(-1) as [{ track: { points: unknown } }])[0]

  it('should hand on a point pulled out of a leg by its handle, between start and goal', async () => {
    const { wrapper, drag } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end' })
    await flushPromises()
    drag([8.15, 46.75], V)
    await flushPromises()
    await wrapper.find('[data-testid=planner-done]').trigger('click')
    expect(plan(wrapper).track).toMatchObject({ points: [s, V, g], goal: 2 })
  })

  it('should take a point between out again on a tap, the leg running on from the start', async () => {
    const track = { points: [s, V, g], legs: [[s, V], [V, g]], goal: 2 }
    const { wrapper, tap } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end', track })
    tap(V[0], V[1], px(V))
    await flushPromises()
    await wrapper.find('[data-testid=planner-done]').trigger('click')
    expect(plan(wrapper).track).toEqual({ points: [s, g], legs: [[s, g]], goal: 1 })
  })

  it('should fold the rows away from the grip, and still say there that a leg found no way', async () => {
    const { wrapper } = mountPlanner({ initial: { start: S, goal: G, end: null }, step: 'end' })
    await flushPromises()
    await wrapper.find('[data-testid=planner-grip]').trigger('click')
    expect(wrapper.emitted('update:compact')).toEqual([[true]])

    await wrapper.setProps({ compact: true })
    expect(wrapper.find('[data-testid=planner-note]').text()).toBe('map.plan.follow.gap')
  })
})
