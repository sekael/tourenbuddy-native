import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarFeedError } from '@/features/calendar/domain/repositories/calendar-feed-repository'
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const availability = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/features/calendar/presentation/stores/availability-store', () => ({
  useAvailabilityStore: () => availability,
}))

const repo = vi.hoisted(() => ({
  listFeeds: vi.fn(),
  addFeed: vi.fn(),
  removeFeed: vi.fn(),
  relabelFeed: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  regenerateToken: vi.fn(),
  triggerSync: vi.fn(),
}))
vi.mock('@/features/calendar/data/repositories/calendar-feed-repository-impl', () => ({
  SupabaseCalendarFeedRepository: vi.fn(() => repo),
}))

const feed = (id: string) => ({ id, host: 'cal.example', label: null, lastSyncedAt: null, lastError: null })

describe('useCalendarFeedStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    repo.listFeeds.mockResolvedValue([])
  })

  describe('addFeed', () => {
    it('should reject an http:// URL before any request', async () => {
      const store = useCalendarFeedStore()
      expect(await store.addFeed('http://cal.example/a.ics', '')).toBe(false)
      expect(repo.addFeed).not.toHaveBeenCalled()
      expect(store.error).toBe('calendar.sync.errors.invalid_url')
    })

    it('should normalize webcal:// to https:// and store a blank label as null', async () => {
      const store = useCalendarFeedStore()
      await store.addFeed('  webcal://cal.example/a.ics ', '  ')
      expect(repo.addFeed).toHaveBeenCalledWith('https://cal.example/a.ics', null)
    })

    it('should surface the feed-limit rejection as the localized message and not sync', async () => {
      repo.addFeed.mockRejectedValue(new CalendarFeedError('limit'))
      const store = useCalendarFeedStore()
      expect(await store.addFeed('https://cal.example/6.ics', '')).toBe(false)
      expect(store.error).toBe('calendar.sync.errors.limit')
      expect(repo.triggerSync).not.toHaveBeenCalled()
    })

    it('should never show raw database text', async () => {
      repo.addFeed.mockRejectedValue(new Error('duplicate key value violates unique constraint "user_calendar_feeds_user_id_url_key"'))
      const store = useCalendarFeedStore()
      await store.addFeed('https://cal.example/a.ics', '')
      expect(store.error).toBe('calendar.sync.errors.unknown')
    })

    it('should sync right after connecting, so the result shows without waiting for the cron', async () => {
      const store = useCalendarFeedStore()
      expect(await store.addFeed('https://cal.example/a.ics', 'Work')).toBe(true)
      expect(repo.triggerSync).toHaveBeenCalledOnce()
      expect(availability.load).toHaveBeenCalled()
    })
  })

  describe('removeFeed', () => {
    it('should resync when other feeds remain', async () => {
      repo.listFeeds.mockResolvedValue([feed('a'), feed('b')])
      const store = useCalendarFeedStore()
      await store.loadFeeds()
      repo.listFeeds.mockResolvedValue([feed('b')])
      await store.removeFeed('a')
      expect(store.feeds.map(f => f.id)).toEqual(['b'])
      expect(repo.triggerSync).toHaveBeenCalledOnce()
    })

    it('should reload availability without syncing when the last feed is removed', async () => {
      repo.listFeeds.mockResolvedValue([feed('a')])
      const store = useCalendarFeedStore()
      await store.loadFeeds()
      await store.removeFeed('a')
      expect(store.feeds).toEqual([])
      expect(repo.triggerSync).not.toHaveBeenCalled()
      expect(availability.load).toHaveBeenCalledOnce()
    })

    it('should keep the feed listed when the delete fails', async () => {
      repo.listFeeds.mockResolvedValue([feed('a')])
      repo.removeFeed.mockRejectedValue(new CalendarFeedError('unknown'))
      const store = useCalendarFeedStore()
      await store.loadFeeds()
      await store.removeFeed('a')
      expect(store.feeds.map(f => f.id)).toEqual(['a'])
      expect(store.error).toBe('calendar.sync.errors.unknown')
    })
  })

  it('should reject an unsatisfiable window before the request', async () => {
    const store = useCalendarFeedStore()
    expect(await store.saveSettings({ coreStart: '04:00', coreEnd: '12:00', minFreeMinutes: 481 })).toBe(false)
    expect(await store.saveSettings({ coreStart: '12:00', coreEnd: '12:00', minFreeMinutes: 60 })).toBe(false)
    expect(repo.updateSettings).not.toHaveBeenCalled()
    expect(store.error).toBe('calendar.sync.errors.invalid_window')
  })

  it('should keep loaded feeds when the sync trigger and the reload both fail', async () => {
    repo.listFeeds.mockResolvedValue([feed('a')])
    const store = useCalendarFeedStore()
    await store.loadFeeds()
    repo.triggerSync.mockRejectedValue(new CalendarFeedError('sync_failed'))
    repo.listFeeds.mockRejectedValue(new Error('offline'))
    await store.sync()
    expect(store.feeds.map(f => f.id)).toEqual(['a'])
    expect(store.error).not.toBeNull()
    expect(store.syncing).toBe(false)
  })
})
