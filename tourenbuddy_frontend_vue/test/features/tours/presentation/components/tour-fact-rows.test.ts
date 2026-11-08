import type { Tour } from '@/features/tours/domain/entities/tour'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BaseIcon from '@/core/components/base-icon.vue'
import { iconRegistry } from '@/core/components/icons'
import TourFactRows from '@/features/tours/presentation/components/tour-fact-rows.vue'

const START = { lng: 7.9, lat: 46.6 }

function mountRows(overrides: Partial<Tour> = {}, slots: Record<string, string> = {}) {
  const tour = {
    tourTypes: [],
    startPoint: null,
    endPoint: null,
    startPointName: null,
    startPointElevation: null,
    endPointName: null,
    endPointElevation: null,
    seasons: null,
    description: null,
    equipment: null,
    notes: null,
    ...overrides,
  } as unknown as Tour
  return mount(TourFactRows, { props: { tour }, slots })
}

const facts = (w: ReturnType<typeof mountRows>) => w.findAll('[data-fact]').map(r => r.attributes('data-fact'))
function groups(w: ReturnType<typeof mountRows>) {
  return w.findAll('.fact-group').map(g => g.findAll('[data-fact]').map(r => r.attributes('data-fact')))
}

describe('tourFactRows', () => {
  it('should render nothing but the type row for a tour with only a type', () => {
    expect(facts(mountRows({ tourTypes: ['skitour'] }))).toEqual(['type'])
  })

  it('should colour every activity chip with its own type, not the first one\'s', () => {
    const chips = mountRows({ tourTypes: ['skitour', 'hiking'] }).findAll('.type-tag')
    expect(chips.map(c => c.attributes('style'))).toEqual(['--tag-color: #4338CA;', '--tag-color: #E11D48;'])
  })

  it('should show a split tour leg by leg, the way up first, and its end as the landing', () => {
    const w = mountRows({
      tourTypes: ['paragliding', 'climbing'],
      legs: { ascent: ['climbing'], descent: ['paragliding'] },
      startPoint: START,
      endPoint: { lng: 7.8, lat: 46.5 },
      endPointName: 'Lauterbrunnen',
    })
    expect(w.findAll('.type-group').map(g => [g.attributes('data-leg'), g.findAll('.type-tag').map(c => c.text())]))
      .toEqual([['up', ['tours.type.climbing']], ['down', ['tours.type.paragliding']]])
    expect(w.find('[data-fact="end"] .row-label').text()).toBe('tours.infoSheet.landingShort')
  })

  it('should name a glider flown the whole way once, not as its way up and way down', () => {
    const w = mountRows({ tourTypes: ['paragliding'], legs: { ascent: ['paragliding'], descent: ['paragliding'] } })
    expect(w.findAll('.type-group').map(g => g.attributes('data-leg') ?? null)).toEqual([null])
  })

  it('should not claim a flown tour without a landing ends at its goal', () => {
    const w = mountRows({ tourTypes: ['paragliding'], startPoint: START })
    expect(w.find('[data-fact="end"]').text()).toContain('tours.infoSheet.landingOpen')
  })

  it('should render no rows at all for a legacy tour without type', () => {
    expect(facts(mountRows())).toEqual([])
  })

  it('should show a one-way tour as ending at the goal, with the goal flag and no end elevation', () => {
    const w = mountRows({ startPoint: START, endPoint: null, endPointElevation: 999 })
    const end = w.find('[data-fact="end"]')
    expect(end.text()).toContain('oneWayToGoalIndicator')
    expect(end.text()).not.toContain('999')
    expect(end.findComponent(BaseIcon).props('name')).toBe('flag')
  })

  it('should show a round trip as such even when the end point carries a name', () => {
    const w = mountRows({ startPoint: START, endPoint: { ...START }, endPointName: 'Preda', endPointElevation: 1789 })
    const end = w.find('[data-fact="end"]')
    expect(end.text()).toContain('roundTrip')
    expect(end.text()).not.toContain('1789')
  })

  it('should read an end picked a few metres off the start as a round trip, like the map does', () => {
    const w = mountRows({ startPoint: START, endPoint: { lng: 7.90005, lat: 46.6 }, endPointName: 'Preda' })
    expect(w.find('[data-fact="end"]').text()).toContain('roundTrip')
  })

  it('should show an end without a start (a connected stage) on its own, as an end', () => {
    const w = mountRows({ endPoint: { lng: 7.8, lat: 46.5 }, endPointName: 'Tierberglihütte', endPointElevation: 2795 })
    expect(groups(w)).toEqual([['end']])
    const end = w.find('[data-fact="end"]')
    expect(end.text()).toContain('Tierberglihütte')
    expect(end.text()).toContain('2795\u00A0m')
    expect(end.findComponent(BaseIcon).props('name')).toBe('sports_score')
  })

  it('should fall back to coordinates for an unnamed start, without an elevation', () => {
    const w = mountRows({ startPoint: START, startPointElevation: 1500 })
    const start = w.find('[data-fact="start"]')
    expect(start.find('.coords').text()).toBe('46.6000°N, 7.9000°E')
    expect(start.text()).not.toContain('1500')
  })

  it('should label start and end visibly, but the free texts only for assistive tech', () => {
    const w = mountRows({ startPoint: START, description: 'Steep', equipment: 'Rope', notes: 'Early' })
    expect(w.find('[data-fact="start"] .row-label').text()).toBe('tours.infoSheet.startShort')
    for (const fact of ['description', 'equipment', 'notes']) {
      const row = w.find(`[data-fact="${fact}"]`)
      expect(row.find('.row-label').exists()).toBe(false)
      expect(row.find('.visually-hidden').exists()).toBe(true)
    }
  })

  it('should leave out empty groups, even when only seasons or only the GPX download fill one', () => {
    const w = mountRows({ seasons: ['winter'], notes: 'Early' }, { route: '<button>GPX</button>' })
    expect(groups(w)).toEqual([['seasons'], ['track'], ['notes']])
  })

  it('should only use registered icons, since an unknown name renders nothing', () => {
    const w = mountRows({ tourTypes: ['climbing'], startPoint: START, seasons: ['winter'], description: 'x', equipment: 'Rope', notes: 'y' }, { partners: '<span>Anna</span>' })
    const names = w.findAllComponents(BaseIcon).map(i => i.props('name'))
    expect(names).toContain('ice_axe')
    expect(names.filter(n => !(n in iconRegistry))).toEqual([])
  })

  it('should render the partners row only when partners are slotted in', () => {
    expect(facts(mountRows({ tourTypes: ['hiking'] }))).not.toContain('partners')
    expect(facts(mountRows({}, { partners: '<span>Anna</span>' }))).toEqual(['partners'])
  })

  it('should link URLs in the description without letting the page be reached back', () => {
    const w = mountRows({ description: 'See https://slf.ch/bulletin first' })
    const link = w.find('[data-fact="description"] a')
    expect(link.attributes('href')).toBe('https://slf.ch/bulletin')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('should lead the route group with the start, marked by the ring', () => {
    const w = mountRows({
      elevation: 3079,
      startPoint: START,
      startPointName: 'Chamanna digl Kesch',
      startPointElevation: 2632,
      endPoint: { lng: 9.81, lat: 46.64 },
      endPointName: 'Chants',
      endPointElevation: 1822,
    })
    expect(groups(w)[0]).toEqual(['start', 'end'])
    expect(w.find('[data-fact="start"]').findComponent(BaseIcon).props('name')).toBe('trip_origin')
    expect(w.find('[data-fact="end"]').text()).toContain('1822\u00A0m')
  })

  it('should show the grade beside the activities, and alone without one', () => {
    expect(mountRows({ tourTypes: ['skitour'], grade: 'WS+' }).find('[data-fact=type] [data-testid=tour-grade]').text()).toContain('WS+')
    expect(facts(mountRows({ grade: 'T3' }))).toEqual(['type'])
    expect(mountRows({ tourTypes: ['skitour'] }).find('[data-testid=tour-grade]').exists()).toBe(false)
  })
})
