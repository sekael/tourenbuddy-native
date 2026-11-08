import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { pace } from '@/core/composables/use-pace'
import TrackDrawPanel from '@/features/map/presentation/components/track-draw-panel.vue'

const props = {
  overlays: [],
  network: null,
  byActivity: false,
  issue: null,
  points: 0,
  metrics: { distance: null, ascent: null, descent: null },
  minutes: null,
  profile: null,
  busy: false,
  canUndo: false,
  canRedo: false,
  closed: false,
}

describe('trackDrawPanel', () => {
  it('should open the pace before the first tap and badge a pace off the standard on the closed time', async () => {
    const w = mount(TrackDrawPanel, { props })
    expect(w.find('[data-testid="draw-pace"]').exists()).toBe(false)
    await w.find('[data-testid="draw-pace-toggle"]').trigger('click')
    // In the status line's place: the panel keeps its height.
    expect(w.find('[role="status"]').exists()).toBe(false)
    await w.find('[data-testid="draw-pace"] input').setValue('1.2')
    expect(pace.value).toBe(1.2)
    // The open slider shows the factor; the time doesn't repeat it.
    expect(w.find('[data-testid="draw-pace-toggle"] [data-testid="pace-badge"]').exists()).toBe(false)
    await w.find('[data-testid="draw-pace-toggle"]').trigger('click')
    expect(w.find('[data-testid="draw-pace"]').exists()).toBe(false)
    expect(w.find('[data-testid="draw-pace-toggle"] [data-testid="pace-badge"]').text()).toContain('1.2×')
    pace.value = 1
  })

  it('should say a part goes straight, though the line follows the ways, as a warning', () => {
    const status = mount(TrackDrawPanel, { props: { ...props, points: 2, gap: true } }).find('[role="status"]')
    expect(status.text()).toBe('map.plan.follow.gap')
    expect(status.classes()).toContain('status--warn')
  })
})
