import type { WriteQueueEntry } from '@/core/offline/write-queue'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import OfflineSyncStatus from '@/core/components/offline-sync-status.vue'
import { deadLetters, pendingCount } from '@/core/offline/queue-status'
import { isOnline } from '@/core/offline/use-online-status'

vi.mock('@/core/offline/queue-status', async importOriginal => ({
  ...await importOriginal<typeof import('@/core/offline/queue-status')>(),
  refreshQueueStatus: vi.fn(),
}))

async function drain(to: { pending: number, dead?: WriteQueueEntry[] }) {
  pendingCount.value = to.pending
  if (to.dead)
    deadLetters.value = to.dead
  await nextTick()
}

describe('offlineSyncStatus', () => {
  afterEach(() => {
    isOnline.value = true
    pendingCount.value = 0
    deadLetters.value = []
  })

  it('should not report a sync when a change failed on the way, only once its retry went through', async () => {
    pendingCount.value = 2
    const wrapper = mount(OfflineSyncStatus)
    await drain({ pending: 0, dead: [{ entityId: 't1' } as WriteQueueEntry] })
    expect(wrapper.find('[data-testid=synced-toast]').exists()).toBe(false)

    await drain({ pending: 1, dead: [] }) // retried
    await drain({ pending: 0 })
    expect(wrapper.find('[data-testid=synced-toast]').exists()).toBe(true)
  })

  it('should not report a sync for changes that cancelled out offline', async () => {
    isOnline.value = false
    pendingCount.value = 1
    const wrapper = mount(OfflineSyncStatus)
    await drain({ pending: 0 })
    expect(wrapper.find('[data-testid=synced-toast]').exists()).toBe(false)
  })
})
