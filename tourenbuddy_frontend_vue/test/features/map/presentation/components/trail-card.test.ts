import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { pace } from '@/core/composables/use-pace'
import TrailCard from '@/features/map/presentation/components/trail-card.vue'

vi.mock('@/core/composables/use-is-desktop', () => ({ useIsDesktop: () => ref(true) }))

const ROUTE = { name: 'Von Tschingel', targetName: 'Bundstock', targetAltitude: 2756, difficulty: 'WS+', ascentTime: '05:00 h', ascentM: 1600, descentM: 1600, sacUrl: null }

function mountCard(route: typeof ROUTE | null) {
  const trail = { overlay: 'ski', id: '1020', lines: [[[7.75, 46.55], [7.74, 46.51]]], route }
  return {
    trail,
    wrapper: mount(TrailCard, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn, initialState: { map: { trailCard: { candidates: [trail], more: 0, selectedId: '1020' } } } })],
        stubs: { Teleport: true },
      },
    }),
  }
}

describe('trailCard', () => {
  it('should offer planning a route with information as a tour', async () => {
    const { wrapper, trail } = mountCard(ROUTE)
    await wrapper.find('[data-testid=trail-plan-tour]').trigger('click')
    expect(wrapper.emitted('plan')).toEqual([[trail]])
  })

  it('should not offer it for a line without route information', () => {
    expect(mountCard(null).wrapper.find('[data-testid=trail-plan-tour]').exists()).toBe(false)
  })

  it('should lead with the summit like a tour, leaving out what the route doesn\'t state', () => {
    const { wrapper } = mountCard({ ...ROUTE, name: '', ascentTime: '', descentM: null as unknown as number })
    expect(wrapper.find('.hero-headline').text()).toMatch(/2.?756/)
    expect(wrapper.find('[data-testid=tour-grade]').text()).toContain('WS+')
    expect(wrapper.find('[data-testid=route-ascent]').exists()).toBe(true)
    expect(wrapper.find('[data-testid=route-descent]').exists()).toBe(false)
    expect(wrapper.find('.hero-name').exists()).toBe(false)
    expect(wrapper.find('.fact').exists()).toBe(false)
    expect(wrapper.find('[data-testid=trail-sac]').exists()).toBe(false)
  })

  it('should keep an ascent time SAC words otherwise as it is, and badge a pace off the standard beside it', async () => {
    const { wrapper } = mountCard({ ...ROUTE, ascentTime: '4-5 h' })
    pace.value = 0.8
    await nextTick()
    expect(wrapper.find('[data-testid=trail-ascent-time]').text()).toMatch(/tours\.route\.ascent 4-5 h.*0\.8×/s)
    pace.value = 1
  })
})
