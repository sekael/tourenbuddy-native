import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useMapStore } from '@/features/map/presentation/stores/map-store'
import OutingNavigator from '@/features/tours/presentation/components/outing-navigator.vue'
import OutingOverviewSheet from '@/features/tours/presentation/components/outing-overview-sheet.vue'
import { useToursStore } from '@/features/tours/presentation/stores/tours-store'
import { TOUR_FILL } from '../../../../fixtures/tour-fill'

vi.mock('@/core/composables/use-is-desktop', () => ({ useIsDesktop: () => ref(true) }))

function segment(id: string, position: number, userId = 'me') {
  return {
    ...TOUR_FILL,
    id,
    userId,
    name: `Segment ${id}`,
    plannedDate: null,
    goal: { lng: 7.5, lat: 46 },
    partnerIds: [],
    tourTypes: ['hiking'],
    elevation: null,
    gpxFilepath: null,
    description: null,
    seasons: null,
    startPoint: null,
    endPoint: null,
    equipment: null,
    notes: null,
    completed: false,
    isFriendTour: userId !== 'me',
    outing: { id: 'o1', name: 'Haute Route', position },
  }
}

function pinia(tours: unknown[], friendTours: unknown[] = []) {
  return createTestingPinia({
    createSpy: vi.fn,
    initialState: {
      tours: { tours, friendTours },
      auth: { currentUser: { id: 'me' } },
    },
  })
}

function mountSheet(outingKey = 'me/o1', tours = [segment('a', 0), segment('b', 1), segment('c', 2)], friendTours: unknown[] = []) {
  return mount(OutingOverviewSheet, {
    props: { outingKey },
    global: { plugins: [pinia(tours, friendTours)], stubs: { Teleport: true } },
  })
}

/** happy-dom has no layout: stack the segment rows 100 px apart. */
function layOut(wrapper: { findAll: (s: string) => { element: Element }[] }) {
  wrapper.findAll('[data-testid="outing-segment"]').forEach(({ element }, i) => {
    element.getBoundingClientRect = () => ({ top: i * 100, height: 100 }) as DOMRect
  })
}

describe('outingOverviewSheet', () => {
  it('should list the segments in order and open one on tap', async () => {
    const wrapper = mountSheet('me/o1', [segment('c', 2), segment('a', 0), segment('b', 1)])
    const rows = wrapper.findAll('[data-testid="outing-segment"]')
    expect(rows.map(r => r.text())).toEqual([
      expect.stringContaining('Segment a'),
      expect.stringContaining('Segment b'),
      expect.stringContaining('Segment c'),
    ])
    await rows[1]!.find('button').trigger('click')
    expect(wrapper.emitted('openSegment')).toEqual([['b']])
  })

  it('should reorder by dragging a handle, remove and rename through the store in edit mode', async () => {
    const wrapper = mountSheet()
    const store = useToursStore()
    await wrapper.find('[data-testid="outing-edit"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="outing-segment"]')
    const handle = rows[0]!.find('[data-testid="segment-handle"]')
    layOut(wrapper)
    await handle.trigger('pointerdown', { button: 0, clientY: 10 })
    await handle.trigger('pointermove', { clientY: 260 })
    await handle.trigger('pointerup')
    expect(store.reorderSegments).toHaveBeenCalledWith(expect.any(Array), 0, 2)
    await wrapper.findAll('[data-testid="segment-remove"]')[2]!.trigger('click')
    expect(store.removeFromOuting).toHaveBeenCalledWith(expect.any(Array), 'c')
    await wrapper.find('[data-testid="outing-name-input"]').setValue('Tour du Mont Blanc')
    await wrapper.find('[data-testid="outing-done"]').trigger('click')
    expect(store.renameOuting).toHaveBeenCalledWith(expect.any(Array), 'Tour du Mont Blanc')
  })

  it('should lift the dragged card with the pointer and mark the drop target until cancelled', async () => {
    const wrapper = mountSheet()
    await wrapper.find('[data-testid="outing-edit"]').trigger('click')
    const cards = () => wrapper.findAll('.card')
    const handle = wrapper.find('[data-testid="segment-handle"]')
    layOut(wrapper)
    await handle.trigger('pointerdown', { button: 0, clientY: 10 })
    await handle.trigger('pointermove', { clientY: 260 })
    expect(cards().map(c => [c.classes('card--dragging'), c.classes('card--over')]))
      .toEqual([[true, false], [false, false], [false, true]])
    expect(cards()[0]!.attributes('style')).toContain('translateY(250px)')
    await handle.trigger('pointercancel')
    expect(wrapper.findAll('.card--dragging, .card--over')).toHaveLength(0)
    expect(useToursStore().reorderSegments).not.toHaveBeenCalled()
  })

  it('should flag only a segment that starts away from where the previous one finishes', () => {
    const wrapper = mountSheet('me/o1', [
      segment('a', 0),
      { ...segment('b', 1), startPoint: { lng: 7.5, lat: 46 } },
      { ...segment('c', 2), startPoint: { lng: 8, lat: 46.5 } },
    ])
    const rows = wrapper.findAll('[data-testid="outing-segment"]')
    expect(rows.map(r => r.find('[data-testid="segment-gap"]').exists())).toEqual([false, false, true])
  })

  it('should let only the owner close a gap: the previous segment then ends where the next starts', async () => {
    const hut = { lng: 8.43, lat: 46.71 }
    const gapped = [segment('a', 0), { ...segment('b', 1), startPoint: hut, startPointName: 'Tierberglihütte SAC' }] as unknown as ReturnType<typeof segment>[]
    const wrapper = mountSheet('me/o1', gapped)
    await wrapper.find('[data-testid="segment-connect"]').trigger('click')
    expect(useToursStore().connectSegments).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b', startPoint: hut }),
    )

    const friend = mountSheet('friend/o1', [], gapped.map(s => ({ ...s, userId: 'friend', isFriendTour: true })))
    expect(friend.find('[data-testid="segment-gap"]').exists()).toBe(true)
    expect(friend.find('[data-testid="segment-connect"]').exists()).toBe(false)
  })

  it('should read like a stage plan: days, way, totals, the hut night and the valley handover', () => {
    const at = (lng: number) => ({ lng, lat: 46.6 })
    const wrapper = mountSheet('me/o1', [
      { ...segment('a', 0), name: 'Chamanna digl Kesch', elevation: 2632, plannedDate: new Date('2026-11-29'), startPoint: at(9.7), startPointName: 'Bergün', startPointElevation: 1367, goal: at(9.86) },
      { ...segment('b', 1), name: 'Piz Porchabella', elevation: 3079, plannedDate: new Date('2026-11-30'), startPoint: at(9.86), startPointElevation: 2632, goal: at(9.9), endPoint: at(9.81), endPointName: 'Chants', endPointElevation: 1822 },
      { ...segment('c', 2), name: 'Muntischè', elevation: 2571, plannedDate: new Date('2026-11-30'), startPoint: at(9.81), startPointElevation: 1822, goal: at(9.88), endPoint: at(9.89), endPointName: 'Bever', endPointElevation: 1707 },
    ])
    expect(wrapper.find('[data-testid="outing-headline"]').text()).toBe('tours.outing.dayCount · tours.outing.segmentCount')
    expect(wrapper.find('[data-testid="outing-way"]').text()).toBe('Bergün → Bever')
    expect(wrapper.find('.hero [data-testid="route-ascent"]').text()).toContain('2461\u00A0m')
    expect(wrapper.find('.hero [data-testid="route-descent"]').text()).toContain('2121\u00A0m')
    const rows = wrapper.findAll('[data-testid="outing-segment"]')
    expect(rows[1]!.find('[data-testid="segment-night"]').text()).toContain('Chamanna digl Kesch · 2632\u00A0m')
    expect(rows[2]!.find('[data-testid="segment-night"]').exists()).toBe(false)
    expect(rows[2]!.find('[data-testid="segment-handover"]').text()).toBe('Chants · 1822\u00A0m')
  })

  it('should total what the segments know and leave out a single-day count', () => {
    const wrapper = mountSheet('me/o1', [
      { ...segment('a', 0), elevation: 2632, startPoint: { lng: 7.4, lat: 46 }, startPointElevation: 1367, plannedDate: new Date('2026-11-29') },
      // A start without a height: that leg is left out, the others still total.
      { ...segment('b', 1), elevation: 3079, startPoint: { lng: 7.45, lat: 46 }, plannedDate: new Date('2026-11-29') },
    ])
    expect(wrapper.find('[data-testid="outing-headline"]').text()).toBe('tours.outing.segmentCount')
    expect(wrapper.find('.hero [data-testid="route-ascent"]').text()).toContain('1265\u00A0m')
    expect(wrapper.findAll('[data-testid="outing-segment"] [data-testid="route-ascent"]')).toHaveLength(1)
  })

  it('should total a first stage connected without a start as climbing nothing, descending to its end', () => {
    const at = (lng: number) => ({ lng, lat: 46.6 })
    const wrapper = mountSheet('me/o1', [
      { ...segment('c', 0), elevation: 3420, goal: at(9.8), endPoint: at(9.86), endPointElevation: 2795 },
      { ...segment('a', 1), elevation: 3503, startPoint: at(9.86), startPointElevation: 2795, goal: at(9.9) },
    ])
    expect(wrapper.find('.hero [data-testid="route-ascent"]').text()).toContain('708\u00A0m')
    expect(wrapper.find('.hero [data-testid="route-descent"]').text()).toContain('625\u00A0m')
  })

  it('should leave the dates-and-totals line out when there is nothing to put on it', () => {
    expect(mountSheet('me/o1', [segment('a', 0), segment('b', 1)]).find('.hero-meta--wrap').exists()).toBe(false)
  })

  it('should say when the order and the dates disagree', () => {
    const wrapper = mountSheet('me/o1', [
      { ...segment('a', 0), plannedDate: new Date('2026-11-30') },
      { ...segment('b', 1), plannedDate: new Date('2026-11-29') },
    ])
    const rows = wrapper.findAll('[data-testid="outing-segment"]')
    expect(rows[1]!.find('[data-testid="segment-early"]').text()).toContain('tours.outing.dateBeforeHint')
    expect(rows[1]!.find('.link').classes()).toContain('link--warn')
  })

  it('should offer a new segment after the last one', async () => {
    const wrapper = mountSheet()
    await wrapper.find('[data-testid="outing-add-segment"]').trigger('click')
    expect(wrapper.find('[data-testid="segment-rule"]').text()).toBe('tours.outing.ruleHint')
    await wrapper.find('[data-testid="add-segment-new"]').trigger('click')
    expect(wrapper.emitted('addSegmentNew')).toEqual([['c']])
  })

  it('should keep a friend\'s outing read-only', () => {
    const wrapper = mountSheet('friend/o1', [], [segment('a', 0, 'friend'), segment('b', 1, 'friend')])
    expect(wrapper.findAll('[data-testid="outing-segment"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="outing-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="outing-add-segment"]').exists()).toBe(false)
  })
})

describe('outingNavigator', () => {
  function mountNavigator(tourId: string, tours = [segment('a', 0), segment('b', 1), segment('c', 2)]) {
    return mount(OutingNavigator, {
      props: { tour: tours.find(t => t.id === tourId)! as never },
      global: { plugins: [pinia(tours)] },
    })
  }

  it('should step to the neighbouring segments and stop at the ends', async () => {
    const wrapper = mountNavigator('c')
    expect(wrapper.text()).toContain('tours.outing.segmentOf')
    expect(wrapper.find('[data-testid="segment-next"]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-testid="segment-prev"]').trigger('click')
    expect(useMapStore().selectTour).toHaveBeenCalledWith('b')
  })

  it('should open the overview from the outing name', async () => {
    const wrapper = mountNavigator('a')
    await wrapper.find('[data-testid="outing-overview-link"]').trigger('click')
    expect(wrapper.emitted('openOuting')).toEqual([['me/o1']])
  })

  it('should not render for a lone segment', () => {
    const wrapper = mountNavigator('a', [segment('a', 0)])
    expect(wrapper.find('nav').exists()).toBe(false)
  })
})
