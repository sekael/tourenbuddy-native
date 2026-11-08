import type { PushSubscriptionRepository } from '@/features/notifications/domain/repositories/push-subscription-repository'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebPush } from '@/features/notifications/presentation/composables/use-web-push'

vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}))

// Multi-device push (#148): every operation is scoped to THIS browser's endpoint.
describe('useWebPush', () => {
  const browserUnsubscribe = vi.fn()
  const subscription = {
    endpoint: 'https://push.example/device-b',
    toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: browserUnsubscribe,
  }
  let repo: { [K in keyof PushSubscriptionRepository]: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    repo = { register: vi.fn().mockResolvedValue(undefined), removeSubscription: vi.fn().mockResolvedValue(undefined) }
    browserUnsubscribe.mockReset().mockResolvedValue(true)
    vi.stubGlobal('Notification', { permission: 'granted' })
    vi.stubGlobal('PushManager', class {})
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => subscription } }) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should delete only this device\'s endpoint when disabling', async () => {
    await useWebPush(repo as never).unsubscribe()

    expect(repo.removeSubscription).toHaveBeenCalledExactlyOnceWith('https://push.example/device-b')
    expect(browserUnsubscribe).toHaveBeenCalled()
  })

  it('should still unsubscribe the browser when the row removal fails', async () => {
    repo.removeSubscription.mockRejectedValue(new Error('offline'))

    await expect(useWebPush(repo as never).unsubscribe()).resolves.toBeUndefined()
    expect(browserUnsubscribe).toHaveBeenCalled()
  })

  it('should report off and register nothing when permission is not granted', async () => {
    vi.stubGlobal('Notification', { permission: 'default' })

    expect(await useWebPush(repo as never).ensureSubscription()).toBe(false)
    expect(repo.register).not.toHaveBeenCalled()
  })

  it('should re-register a live subscription on load (heals a 410-pruned row)', async () => {
    expect(await useWebPush(repo as never).ensureSubscription()).toBe(true)
    expect(repo.register).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/device-b' }))
  })
})
