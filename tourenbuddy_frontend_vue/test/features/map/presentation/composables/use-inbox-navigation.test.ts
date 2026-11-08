import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

const route = vi.hoisted(() => ({ query: { notification: 'n1' } as Record<string, unknown> }))
const inbox = vi.hoisted(() => ({
  find: vi.fn(),
  markRead: vi.fn(),
  targetTourId: (e: { tourId: string | null }) => e.tourId,
  canOpenTour: vi.fn(),
}))
const tours = vi.hoisted(() => ({ tours: [], friendTours: [], loadFriendTours: vi.fn() }))
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))
vi.mock('@/features/notifications/presentation/stores/inbox-store', () => ({ useInboxStore: () => inbox }))
vi.mock('@/features/tours/presentation/stores/tours-store', () => ({ useToursStore: () => tours }))

const { useInboxNavigation } = await import('@/features/map/presentation/composables/use-inbox-navigation')

function mountNav(tour = vi.fn()) {
  let nav!: ReturnType<typeof useInboxNavigation>
  mount(defineComponent({
    setup: () => {
      nav = useInboxNavigation({ overlay: vi.fn(), tour })
    },
    template: '<div />',
  }))
  return { nav: () => nav, tour }
}

describe('useInboxNavigation', () => {
  it('should tell the user when a deep-linked entry\'s tour is gone, and still mark it read', async () => {
    inbox.find.mockResolvedValue({ id: 'n1', action: 'updated', tourId: 't-gone', ref: {} })
    inbox.canOpenTour.mockReturnValue(false)
    const { nav: getNav, tour } = mountNav()
    await flushPromises()
    const nav = getNav()

    expect(inbox.markRead).toHaveBeenCalledWith('n1')
    expect(tour).not.toHaveBeenCalled()
    expect(nav.snackbar.snackbar.value).toMatchObject({ visible: true, message: 'inbox.unavailable' })
  })

  it('should decide access only after refetching friend tours, so a stale cache grants nothing', async () => {
    route.query = {}
    const order: string[] = []
    tours.loadFriendTours.mockImplementation(async () => {
      order.push('refetch')
    })
    inbox.canOpenTour.mockImplementation(() => {
      order.push('check')
      return false // e.g. removed as partner, or the tour went private
    })
    const { nav, tour } = mountNav()

    await nav().openEntry({ id: 'n2', action: 'updated', tourId: 't1', ref: {} } as never)

    expect(order).toEqual(['refetch', 'check'])
    expect(tour).not.toHaveBeenCalled()
    expect(nav().snackbar.snackbar.value).toMatchObject({ visible: true, message: 'inbox.unavailable' })
  })

  describe('availability summary', () => {
    const summary = (dates: unknown) => ({ id: 'n3', type: 'availability', action: 'weekly', tourId: null, ref: { dates } }) as never

    // East of UTC, so local midnight and the UTC date differ (the bug the midnight case catches).
    const originalTz = process.env.TZ
    afterEach(() => {
      process.env.TZ = originalTz
      vi.useRealTimers()
      router.push.mockClear()
    })

    async function openOn([y, m, d, h, min = 0]: number[], dates: unknown) {
      process.env.TZ = 'Europe/Zurich'
      const now = new Date(y!, m! - 1, d!, h!, min)
      route.query = {}
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(now)
      const { nav } = mountNav()
      await nav().openEntry(summary(dates))
      return nav()
    }

    it('should focus the first listed day that is not in the past', async () => {
      await openOn([2030, 1, 9, 12], ['2030-01-08', '2030-01-11'])
      expect(router.push).toHaveBeenCalledWith({ name: 'calendar', query: { day: '2030-01-11' } })
    })

    it('should treat today as not past', async () => {
      await openOn([2030, 1, 9, 12], ['2030-01-08', '2030-01-09', '2030-01-11'])
      expect(router.push).toHaveBeenCalledWith({ name: 'calendar', query: { day: '2030-01-09' } })
    })

    it('should use the local date, not UTC, shortly after local midnight', async () => {
      // 00:30 local on the 9th is still the 8th in UTC for any zone east of UTC (e.g. Zurich).
      await openOn([2030, 1, 9, 0, 30], ['2030-01-08', '2030-01-09'])
      expect(router.push).toHaveBeenCalledWith({ name: 'calendar', query: { day: '2030-01-09' } })
    })

    it('should open the calendar unfocused when every listed day has passed', async () => {
      const nav = await openOn([2030, 1, 12, 12], ['2030-01-08', '2030-01-11'])
      expect(router.push).toHaveBeenCalledWith({ name: 'calendar' })
      expect(nav.snackbar.snackbar.value).not.toMatchObject({ visible: true })
    })

    it('should open the calendar unfocused when the dates are malformed', async () => {
      await openOn([2030, 1, 9, 12], ['not-a-day', 42])
      expect(router.push).toHaveBeenCalledWith({ name: 'calendar' })
    })
  })
})
