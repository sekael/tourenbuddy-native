import type { Ref } from 'vue'
import { createTestingPinia } from '@pinia/testing'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import BaseIcon from '@/core/components/base-icon.vue'
import { isOnline } from '@/core/offline/use-online-status'
import MapActionOverlay from '@/features/map/presentation/components/map-action-overlay.vue'
import { useInboxStore } from '@/features/notifications/presentation/stores/inbox-store'

// The mock factory runs at import time, before module-scope code, so it fills a hoisted holder.
const pwa = vi.hoisted(() => ({ updateAvailable: undefined as unknown as Ref<boolean> }))
vi.mock('@/core/composables/use-pwa-update', async () => {
  const { ref } = await import('vue')
  pwa.updateAvailable = ref(false)
  return { usePwaUpdate: () => ({ updateAvailable: pwa.updateAvailable }) }
})

function mountOverlay(
  options: {
    isPickingLocation?: boolean
    incomingRequests?: Array<{ id: string, status: string }>
    bearing?: number
    overlayActive?: boolean
  } = {},
) {
  return mount(MapActionOverlay, {
    props: {
      bearing: options.bearing ?? 0,
      overlayActive: options.overlayActive ?? false,
    },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            map: { isPickingLocation: options.isPickingLocation ?? false, currentStyleIndex: 0 },
            friendships: { incomingRequests: options.incomingRequests ?? [] },
          },
        }),
      ],
    },
    attachTo: document.body,
  })
}

describe('mapActionOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pwa.updateAvailable.value = false
  })

  describe('collapsed state', () => {
    it('should show trigger and hide menu when closed', () => {
      const wrapper = mountOverlay()
      expect(wrapper.find('[aria-haspopup="menu"]').exists()).toBe(true)
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    })

    it('should not render compass when bearing is zero', () => {
      const wrapper = mountOverlay({ bearing: 0 })
      expect(wrapper.find('.compass-fab').exists()).toBe(false)
    })

    it('should render compass when bearing is non-zero', () => {
      const wrapper = mountOverlay({ bearing: 45 })
      expect(wrapper.find('.compass-fab').exists()).toBe(true)
    })

    it('should emit resetBearing when compass clicked', async () => {
      const wrapper = mountOverlay({ bearing: 45 })
      await wrapper.find('.compass-fab').trigger('click')
      expect(wrapper.emitted('resetBearing')).toHaveLength(1)
    })
  })

  describe('trigger toggle', () => {
    it('should open menu when trigger is clicked', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    })

    it('should close menu when trigger is clicked again', async () => {
      const wrapper = mountOverlay()
      const trigger = wrapper.find('[aria-haspopup="menu"]')
      await trigger.trigger('click')
      await trigger.trigger('click')
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    })
  })

  describe('aRIA attributes', () => {
    it('should set aria-expanded=false when closed', () => {
      const wrapper = mountOverlay()
      const trigger = wrapper.find('[aria-haspopup="menu"]')
      expect(trigger.attributes('aria-expanded')).toBe('false')
    })

    it('should set aria-expanded=true when menu open', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const trigger = wrapper.find('[aria-haspopup="menu"]')
      expect(trigger.attributes('aria-expanded')).toBe('true')
    })

    it('should have aria-controls pointing to speed-dial-menu', () => {
      const wrapper = mountOverlay()
      expect(wrapper.find('[aria-controls="speed-dial-menu"]').exists()).toBe(true)
    })
  })

  describe('trigger icon', () => {
    it('should render menu glyph when collapsed', () => {
      const wrapper = mountOverlay()
      const icon = wrapper.find('[aria-haspopup="menu"]').findComponent(BaseIcon)
      expect(icon.props('name')).toBe('menu')
    })

    it('should render menu glyph (no swap) when expanded', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const fabButton = wrapper.find('.fab')
      expect(fabButton.findComponent(BaseIcon).props('name')).toBe('menu')
    })

    it('should apply open class to trigger when menu is open', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(wrapper.find('.fab.open').exists()).toBe(true)
    })
  })

  describe('eSC and outside click', () => {
    it('should close menu on ESC key', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(wrapper.find('[role="menu"]').exists()).toBe(true)
      await wrapper.find('.overlay').trigger('keydown', { key: 'Escape' })
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    })

    it('should close menu when backdrop is clicked', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      await wrapper.find('.backdrop').trigger('click')
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    })
  })

  describe('isPickingLocation', () => {
    it('should hide entire overlay when isPickingLocation is true', () => {
      const wrapper = mountOverlay({ isPickingLocation: true })
      expect(wrapper.find('.overlay').exists()).toBe(false)
    })
  })

  describe('menu contents', () => {
    it('should not contain tours entry in speed dial', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const buttons = wrapper.findAll('[role="menuitem"]')
      const toursBtn = buttons.find(b => b.text().includes('map.overlay.tours'))
      expect(toursBtn).toBeUndefined()
    })

    it('should not contain add-tour entry in speed dial', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const buttons = wrapper.findAll('[role="menuitem"]')
      const addTourBtn = buttons.find(b => b.text().includes('map.overlay.addTour'))
      expect(addTourBtn).toBeUndefined()
    })
  })

  describe('badge bubble-up', () => {
    it('should count only inbox entries on the trigger, not pending friend requests too', async () => {
      const wrapper = mountOverlay({ incomingRequests: [{ id: '1', status: 'pending' }] })
      // @pinia/testing getters are writable stubs. The request's own entry is among these 2.
      ;(useInboxStore() as unknown as { attentionCount: number }).attentionCount = 2
      await nextTick()
      expect(wrapper.get('[data-testid="trigger-count"]').text()).toBe('2')
    })

    it('should show only a dot on the trigger for a pending request with nothing unread', () => {
      const wrapper = mountOverlay({ incomingRequests: [{ id: '1', status: 'pending' }] })
      expect(wrapper.find('[data-testid="trigger-dot"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="trigger-count"]').exists()).toBe(false)
    })

    it('should prefer the count over the dot once anything is unread', async () => {
      const wrapper = mountOverlay({ incomingRequests: [{ id: '1', status: 'pending' }] })
      ;(useInboxStore() as unknown as { attentionCount: number }).attentionCount = 1
      await nextTick()
      expect(wrapper.get('[data-testid="trigger-count"]').text()).toBe('1')
      expect(wrapper.find('[data-testid="trigger-dot"]').exists()).toBe(false)
    })

    it('should not mark contacts for resolved friend requests', async () => {
      const wrapper = mountOverlay({ incomingRequests: [{ id: '1', status: 'accepted' }] })
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(wrapper.find('[data-testid="menu-dot"]').exists()).toBe(false)
    })

    it('should hide the trigger count while the menu is open', async () => {
      const wrapper = mountOverlay({
        incomingRequests: [{ id: '1', status: 'pending' }],
      })
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(wrapper.find('[data-testid="trigger-count"]').exists()).toBe(false)
    })

    it('should show a dot, not a count, on contacts for a pending friend request', async () => {
      const wrapper = mountOverlay({
        incomingRequests: [{ id: '1', status: 'pending' }],
      })
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(wrapper.find('[data-testid="menu-dot"]').exists()).toBe(true)
      expect(wrapper.find('.badge').exists()).toBe(false)
    })
  })

  describe('pending app update', () => {
    function profileItem(wrapper: ReturnType<typeof mountOverlay>) {
      return wrapper.findAll('[role="menuitem"]').find(b => b.text().includes('map.overlay.profile'))!
    }

    it('should show a dot on the trigger when an update waits and nothing is unread', () => {
      pwa.updateAvailable.value = true
      const wrapper = mountOverlay()
      expect(wrapper.find('[data-testid="trigger-dot"]').exists()).toBe(true)
    })

    it('should keep the inbox count on the trigger and mark the profile item instead', async () => {
      pwa.updateAvailable.value = true
      const wrapper = mountOverlay()
      ;(useInboxStore() as unknown as { attentionCount: number }).attentionCount = 2
      await nextTick()
      expect(wrapper.get('[data-testid="trigger-count"]').text()).toBe('2')

      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(profileItem(wrapper).find('[data-testid="menu-dot"]').exists()).toBe(true)
      expect(profileItem(wrapper).attributes('aria-label')).toBe('map.overlay.profileUpdateAvailable')
    })

    it('should not mark the profile item without a pending update', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(profileItem(wrapper).find('[data-testid="menu-dot"]').exists()).toBe(false)
      expect(profileItem(wrapper).attributes('aria-label')).toBe('map.overlay.profileTooltip')
    })
  })

  describe('menu item events', () => {
    it('should emit openContacts and close menu when contacts item clicked', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const buttons = wrapper.findAll('[role="menuitem"]')
      const contactsBtn = buttons.find(b => b.text().includes('map.overlay.contacts'))
      await contactsBtn?.trigger('click')
      expect(wrapper.emitted('openContacts')).toHaveLength(1)
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    })

    it('should emit openProfile and close menu when profile item clicked', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const buttons = wrapper.findAll('[role="menuitem"]')
      const profileBtn = buttons.find(b => b.text().includes('map.overlay.profile'))
      await profileBtn?.trigger('click')
      expect(wrapper.emitted('openProfile')).toHaveLength(1)
    })

    it('should emit openFeedback and close menu when feedback item clicked', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const buttons = wrapper.findAll('[role="menuitem"]')
      const feedbackBtn = buttons.find(b => b.text().includes('map.overlay.feedback'))
      await feedbackBtn?.trigger('click')
      expect(wrapper.emitted('openFeedback')).toHaveLength(1)
    })
  })

  describe('overlayActive', () => {
    it('should emit dismissOverlay and not open menu when overlay is active', async () => {
      const wrapper = mountOverlay({ overlayActive: true })
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      expect(wrapper.emitted('dismissOverlay')).toHaveLength(1)
      expect(wrapper.find('[role="menu"]').exists()).toBe(false)
    })

    it('should apply disabled class to trigger when overlay is active', () => {
      const wrapper = mountOverlay({ overlayActive: true })
      expect(wrapper.find('.trigger--overlay-active').exists()).toBe(true)
    })
  })

  describe('menu-item layout', () => {
    it('should put the label before the icon so icons line up above the trigger', async () => {
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const firstItem = wrapper.find('[role="menuitem"]')
      const children = firstItem.element.children
      expect(children[0]!.classList.contains('label')).toBe(true)
      expect(children[1]!.classList.contains('icon-wrap')).toBe(true)
    })

    it('should check exactly the current base map among the options', async () => {
      const wrapper = mountOverlay()
      ;(wrapper.vm as unknown as { openMapLayers: () => void }).openMapLayers()
      await wrapper.vm.$nextTick()
      const options = wrapper.findAll('[role="radio"]')
      expect(options.length).toBeGreaterThan(1)
      expect(options.map(o => o.attributes('aria-checked'))).toEqual(
        options.map((_, i) => String(i === 0)),
      )
    })
  })

  describe('map layers panel', () => {
    async function openPanel(options: Parameters<typeof mountOverlay>[0] = {}) {
      const wrapper = mountOverlay(options)
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      await wrapper.find('[data-tour="menu-map-layers"]').trigger('click')
      return wrapper
    }

    afterEach(() => {
      isOnline.value = true
    })

    it('should take the menu\'s place above the trigger', async () => {
      const wrapper = await openPanel()
      expect(wrapper.find('[data-tour="map-layers"]').exists()).toBe(true)
      expect(wrapper.find('#speed-dial-menu').exists()).toBe(false)
    })

    it('should collapse the whole menu once a base map is chosen', async () => {
      const wrapper = await openPanel()
      await wrapper.findAll('[role="radio"]')[1]!.trigger('click')
      expect(wrapper.find('#speed-dial-menu').exists()).toBe(false)
      expect(wrapper.find('[data-tour="map-layers"]').exists()).toBe(false)
    })

    it('should keep the panel open while toggling overlays', async () => {
      const wrapper = await openPanel()
      const toggles = () => wrapper.findAll('[aria-pressed]')
      await toggles()[0]!.trigger('click')
      await toggles()[1]!.trigger('click')
      expect(wrapper.find('[data-tour="map-layers"]').exists()).toBe(true)
      expect(toggles().map(t => t.attributes('aria-pressed'))).toEqual(['true', 'true'])
    })

    it('should disable base maps offline but keep overlay toggles and the entry usable', async () => {
      isOnline.value = false
      const wrapper = mountOverlay()
      await wrapper.find('[aria-haspopup="menu"]').trigger('click')
      const entry = wrapper.find('[data-tour="menu-map-layers"]')
      expect(entry.attributes('disabled')).toBeUndefined()
      await entry.trigger('click')
      expect(wrapper.findAll('[role="radio"]').every(r => r.attributes('disabled') !== undefined)).toBe(true)
      expect(wrapper.findAll('[aria-pressed]').every(r => r.attributes('disabled') === undefined)).toBe(true)
      expect(wrapper.text()).toContain('map.layers.needsConnection')
    })
  })
})
