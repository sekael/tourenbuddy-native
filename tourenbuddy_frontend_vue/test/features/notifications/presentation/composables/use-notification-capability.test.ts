import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationCapability } from '@/features/notifications/presentation/composables/use-notification-capability'

describe('useNotificationCapability', () => {
  const originalNavigator = { ...navigator }
  const originalWindow = { matchMedia: window.matchMedia }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalNavigator.userAgent,
      writable: true,
      configurable: true,
    })
    window.matchMedia = originalWindow.matchMedia
  })

  it('should report pushSupported=true on a desktop Chrome-like environment', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0',
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'PushManager', { value: {}, configurable: true })
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })

    const { pushSupported, requiresPwaInstall } = useNotificationCapability()
    expect(requiresPwaInstall.value).toBe(false)
    expect(pushSupported.value).toBe(true)
  })

  it('should require PWA install on iOS Safari not in standalone', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      writable: true,
      configurable: true,
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })

    const { pushSupported, requiresPwaInstall } = useNotificationCapability()
    expect(requiresPwaInstall.value).toBe(true)
    expect(pushSupported.value).toBe(false)
  })

  it('should not require PWA install on iOS when in standalone mode', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15',
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'PushManager', { value: {}, configurable: true })
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })

    const { requiresPwaInstall } = useNotificationCapability()
    expect(requiresPwaInstall.value).toBe(false)
  })
})
