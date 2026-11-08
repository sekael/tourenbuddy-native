import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MapSpeedDialMenu from '@/features/map/presentation/components/map-speed-dial-menu.vue'
import SpeedDialTrigger from '@/features/map/presentation/components/speed-dial-trigger.vue'

const triggerProps = { isOpen: false, titleOpen: 'close', titleClosed: 'open' }

describe('inbox badge on the speed dial', () => {
  it.each([[0, null], [3, '3'], [12, '9+']])('should show %i as %s on the trigger and the menu entry', (count, shown) => {
    const trigger = mount(SpeedDialTrigger, { props: { ...triggerProps, count } })
    const menu = mount(MapSpeedDialMenu, {
      props: { items: [{ id: 'inbox', icon: 'notifications', label: 'Inbox', badge: count }] },
    })

    expect(trigger.find('[data-testid="trigger-count"]').exists() ? trigger.get('[data-testid="trigger-count"]').text() : null).toBe(shown)
    expect(menu.find('.badge').exists() ? menu.get('.badge').text() : null).toBe(shown)
  })
})
