import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SeasonsGantt from '@/features/calendar/presentation/components/seasons-gantt.vue'

function tour(id: string, name: string, seasons: string[] | null, extra: object = {}) {
  return { id, name, seasons, tourTypes: ['hiking'], ...extra } as any
}

function mountGantt(tours: any[], friendTours: any[] = []) {
  return mount(SeasonsGantt, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: { tours: { tours, friendTours, isLoading: false, error: null } },
        }),
      ],
    },
  })
}

describe('seasonsGantt', () => {
  it('renders owned tours only, never friend tours', () => {
    const wrapper = mountGantt(
      [tour('t1', 'My Tour', ['summer'])],
      [tour('f1', 'Friend Tour', ['summer'], { isFriendTour: true, isPartner: true })],
    )
    expect(wrapper.text()).toContain('My Tour')
    expect(wrapper.text()).not.toContain('Friend Tour')
  })

  it('shows the empty-state label for a tour with no seasons', () => {
    const wrapper = mountGantt([tour('t1', 'Untagged', null)])
    expect(wrapper.find('.no-seasons').exists()).toBe(true)
  })

  it('draws a single current-season marker line', () => {
    const wrapper = mountGantt([tour('t1', 'My Tour', ['summer'])])
    expect(wrapper.findAll('.season-now-line')).toHaveLength(1)
  })
})
