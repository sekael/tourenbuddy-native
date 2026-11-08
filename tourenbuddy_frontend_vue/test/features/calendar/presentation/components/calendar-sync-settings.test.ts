import { createTestingPinia } from '@pinia/testing'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CalendarSyncSettings from '@/features/calendar/presentation/components/calendar-sync-settings.vue'
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store'

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}))

const settings = { coreStart: '06:00', coreEnd: '18:00', minFreeMinutes: 360, feedToken: 'tok' }

function mountSettings() {
  const wrapper = mount(CalendarSyncSettings, {
    global: {
      plugins: [createTestingPinia({
        createSpy: vi.fn,
        initialState: { calendarFeed: { settings, feeds: [] } },
      })],
      stubs: { CalendarOutboundFeed: true, CalendarFeedHelp: true },
    },
  })
  const button = () => wrapper.find('.save-window')
  const startInput = () => wrapper.find('.window-form input[type=time]')
  return { wrapper, store: useCalendarFeedStore(), button, startInput }
}

describe('calendarSyncSettings window save', () => {
  it('should disable save while the form matches the saved settings', () => {
    const { button } = mountSettings()
    expect(button().attributes('disabled')).toBeDefined()
  })

  it('should disable save again when an edit is reverted', async () => {
    const { button, startInput } = mountSettings()
    await startInput().setValue('07:00')
    expect(button().attributes('disabled')).toBeUndefined()
    await startInput().setValue('06:00')
    expect(button().attributes('disabled')).toBeDefined()
  })

  it('should not confirm and keep save enabled when saving fails', async () => {
    const { store, button, startInput, wrapper } = mountSettings()
    vi.mocked(store.saveSettings).mockResolvedValue(false)
    await startInput().setValue('07:00')
    await wrapper.find('.window-form').trigger('submit')
    await flushPromises()
    expect(button().classes()).not.toContain('save-window--saved')
    expect(button().attributes('disabled')).toBeUndefined()
  })

  it('should confirm a successful save and clear the confirmation on the next edit', async () => {
    const { store, button, startInput, wrapper } = mountSettings()
    vi.mocked(store.saveSettings).mockImplementation(async (next) => {
      store.settings = { ...store.settings!, ...next }
      return true
    })
    await startInput().setValue('07:00')
    await wrapper.find('.window-form').trigger('submit')
    await flushPromises()
    expect(button().classes()).toContain('save-window--saved')
    expect(button().text()).toContain('calendar.sync.savedWindow')
    expect(button().attributes('disabled')).toBeDefined()

    await startInput().setValue('08:00')
    expect(button().classes()).not.toContain('save-window--saved')
    expect(button().attributes('disabled')).toBeUndefined()
  })
})
