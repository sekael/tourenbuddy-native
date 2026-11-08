import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import OfflineIndicator from '@/core/components/offline-indicator.vue'
import { pendingCount } from '@/core/offline/queue-status'
import { isOnline } from '@/core/offline/use-online-status'

describe('offlineIndicator', () => {
  afterEach(() => {
    isOnline.value = true
    pendingCount.value = 0
  })

  it('should keep the bar up with the waiting changes once back online, until they have synced', async () => {
    isOnline.value = false
    pendingCount.value = 2
    const bar = mount(OfflineIndicator).find('.offline-bar')
    expect(bar.text()).toBe('offline.bar.waiting')

    isOnline.value = true
    await nextTick()
    expect(bar.classes()).toContain('offline-bar--on')
    expect(bar.text()).toBe('offlineSync.pendingCount')

    pendingCount.value = 0
    await nextTick()
    expect(bar.classes()).not.toContain('offline-bar--on')
    // It closes with its last words rather than emptying first.
    expect(bar.text()).toBe('offlineSync.pendingCount')
  })

  it('should open no band while online with nothing waiting', () => {
    const bar = mount(OfflineIndicator).find('.offline-bar')
    expect(bar.classes()).not.toContain('offline-bar--on')
  })
})
