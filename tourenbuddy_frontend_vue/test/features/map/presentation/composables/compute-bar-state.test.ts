import { describe, expect, it } from 'vitest'
import { computeBarState } from '@/features/map/presentation/composables/compute-bar-state'

const base = { isPickingLocation: false, speedDialOpen: false, isAuthenticated: true }

describe('computeBarState', () => {
  describe('hidden cases', () => {
    it('should hide bar when isPickingLocation is true', () => {
      const state = computeBarState({ ...base, isPickingLocation: true, activeOverlay: null })
      expect(state.visible).toBe(false)
      expect(state.toursAction).toBe('hidden')
      expect(state.addTourAction).toBe('hidden')
    })

    it('should hide bar when tours overlay is active', () => {
      const state = computeBarState({ ...base, activeOverlay: 'tours' })
      expect(state.visible).toBe(false)
    })

    it('should hide bar when tour overlay is active', () => {
      const state = computeBarState({ ...base, activeOverlay: 'tour' })
      expect(state.visible).toBe(false)
    })

    it('should hide bar when tour-creation overlay is active', () => {
      const state = computeBarState({ ...base, activeOverlay: 'tour-creation' })
      expect(state.visible).toBe(false)
    })
  })

  describe('enabled cases', () => {
    it('should be fully enabled with no overlay and authenticated', () => {
      const state = computeBarState({ ...base, activeOverlay: null })
      expect(state.visible).toBe(true)
      expect(state.toursAction).toBe('open')
      expect(state.addTourAction).toBe('pick')
    })

    it('should disable addTour when unauthenticated and no overlay', () => {
      const state = computeBarState({ ...base, activeOverlay: null, isAuthenticated: false })
      expect(state.visible).toBe(true)
      expect(state.toursAction).toBe('open')
      expect(state.addTourAction).toBe('disabled')
    })
  })

  describe('dismiss cases (non-tour overlays)', () => {
    it.each(['profile', 'contacts', 'feedback', 'friend-requests'])(
      'should show visible-but-dismiss when %s overlay is active',
      (overlay) => {
        const state = computeBarState({ ...base, activeOverlay: overlay })
        expect(state.visible).toBe(true)
        expect(state.toursAction).toBe('dismiss')
        expect(state.addTourAction).toBe('dismiss')
      },
    )

    it('should show dismiss when speed dial is open', () => {
      const state = computeBarState({ ...base, activeOverlay: null, speedDialOpen: true })
      expect(state.visible).toBe(true)
      expect(state.toursAction).toBe('dismiss')
      expect(state.addTourAction).toBe('dismiss')
    })
  })
})
