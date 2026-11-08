import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockUpdateServiceWorker = vi.fn()
const mockNeedRefresh = ref(false)
const mockRegUpdate = vi.fn(() => Promise.resolve())
const mockUseRegisterSW = vi.fn((opts: { onRegisteredSW?: (url: string, reg: unknown) => void }) => {
  opts.onRegisteredSW?.('/sw.js', { update: mockRegUpdate })
  return { needRefresh: mockNeedRefresh, updateServiceWorker: mockUpdateServiceWorker }
})
const mockIsOnline = ref(true)

vi.mock('virtual:pwa-register/vue', () => ({ useRegisterSW: (o: never) => mockUseRegisterSW(o) }))
vi.mock('@/core/offline/use-online-status', () => ({ isOnline: mockIsOnline }))

let onControllerChange: (() => void) | undefined
let onVisibilityChange: (() => void) | undefined

const mockServiceWorker = {
  controller: null as object | null,
  addEventListener: (event: string, fn: () => void) => {
    if (event === 'controllerchange')
      onControllerChange = fn
  },
}
Object.defineProperty(navigator, 'serviceWorker', { value: mockServiceWorker, configurable: true })

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
}

async function load() {
  const mod = await import('@/core/composables/use-pwa-update')
  return { ...mod, pwa: mod.usePwaUpdate() }
}

describe('usePwaUpdate', () => {
  let reloadSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mockNeedRefresh.value = false
    mockIsOnline.value = true
    mockUpdateServiceWorker.mockClear()
    mockRegUpdate.mockClear()
    mockUseRegisterSW.mockClear()
    onControllerChange = undefined
    onVisibilityChange = undefined
    mockServiceWorker.controller = {}
    // Capture instead of registering: listeners of earlier tests' instances must not fire.
    vi.spyOn(document, 'addEventListener').mockImplementation(((event: string, fn: () => void) => {
      if (event === 'visibilitychange')
        onVisibilityChange = fn
    }) as typeof document.addEventListener)
    reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should register the service worker once for several consumers', async () => {
    const mod = await import('@/core/composables/use-pwa-update')
    expect(mod.usePwaUpdate()).toBe(mod.usePwaUpdate())
    expect(mockUseRegisterSW).toHaveBeenCalledTimes(1)
  })

  it('should keep the update available when the banner is dismissed', async () => {
    const { pwa } = await load()
    mockNeedRefresh.value = true
    pwa.dismissBanner()
    expect(pwa.showBanner.value).toBe(false)
    expect(pwa.updateAvailable.value).toBe(true)
    expect(mockUpdateServiceWorker).not.toHaveBeenCalled()
  })

  it('should check on start, since registering alone does not re-fetch sw.js', async () => {
    await load()
    expect(mockRegUpdate).toHaveBeenCalledTimes(1)
  })

  it('should not check on start while offline, but on the first return once online', async () => {
    mockIsOnline.value = false
    await load()
    expect(mockRegUpdate).not.toHaveBeenCalled()
    mockIsOnline.value = true
    onVisibilityChange!()
    expect(mockRegUpdate).toHaveBeenCalledTimes(1)
  })

  it('should not check again when returning within the interval', async () => {
    const { UPDATE_CHECK_INTERVAL_MS } = await load()
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS - 1)
    onVisibilityChange!()
    expect(mockRegUpdate).toHaveBeenCalledTimes(1) // the start check only
  })

  it('should not check on return while offline', async () => {
    const { UPDATE_CHECK_INTERVAL_MS } = await load()
    mockIsOnline.value = false
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    onVisibilityChange!()
    expect(mockRegUpdate).toHaveBeenCalledTimes(1)
  })

  it('should check once per interval when returning to the foreground', async () => {
    const { UPDATE_CHECK_INTERVAL_MS } = await load()
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    onVisibilityChange!()
    onVisibilityChange!()
    expect(mockRegUpdate).toHaveBeenCalledTimes(2)
  })

  it('should not throw when the update check fails', async () => {
    mockRegUpdate.mockImplementation(() => Promise.reject(new Error('offline')))
    const { UPDATE_CHECK_INTERVAL_MS } = await load()
    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    expect(() => onVisibilityChange!()).not.toThrow()
    await vi.runAllTimersAsync()
    mockRegUpdate.mockImplementation(() => Promise.resolve())
  })

  it('should reload a visible window only once on repeated controllerchange', async () => {
    await load()
    onControllerChange!()
    onControllerChange!()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('should not reload a hidden window itself', async () => {
    await load()
    setVisibility('hidden')
    onControllerChange!()
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('should not reload when the first install claims an uncontrolled page', async () => {
    mockServiceWorker.controller = null
    await load()
    onControllerChange!()
    expect(reloadSpy).not.toHaveBeenCalled()
    onControllerChange!() // a later update in the same session still reloads
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })
})
