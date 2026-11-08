import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnboardingTour } from '@/features/onboarding/presentation/composables/use-onboarding-tour'
import { ONBOARDING_STEPS } from '@/features/onboarding/presentation/onboarding-steps'

// --- mocks -------------------------------------------------------------------
vi.mock('driver.js/dist/driver.css', () => ({}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/core/logging/use-logger', () => ({
  useLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

interface MockDriver {
  config: any
  highlighted: any[]
  destroyed: boolean
  highlight: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
}
const driverInstances: MockDriver[] = []
vi.mock('driver.js', () => ({
  driver: vi.fn((config: any) => {
    const inst: MockDriver = {
      config,
      highlighted: [],
      destroyed: false,
      highlight: vi.fn(function (this: MockDriver, step: any) {
        this.highlighted.push(step)
      }),
      destroy: vi.fn(function (this: MockDriver) {
        this.destroyed = true
      }),
      refresh: vi.fn(),
    }
    inst.highlight = inst.highlight.bind(inst)
    inst.destroy = inst.destroy.bind(inst)
    driverInstances.push(inst)
    return inst
  }),
}))

// --- helpers -----------------------------------------------------------------
const LAST = ONBOARDING_STEPS.length - 1
// Highlighting waits for the scroll and the target's position to settle (~5
// frames of 16 ms, twice) plus the glide, so a step takes a few hundred ms.
const flush = () => new Promise(r => setTimeout(r, 400))
const lastDriver = () => driverInstances[driverInstances.length - 1]
// A target is highlighted twice: spotlight-only first, then re-highlighted with
// the popover once the layout settles. Assert against the popover-bearing call.
function popoverTitle(d: MockDriver = lastDriver()) {
  return d.highlighted.at(-1)?.popover?.title
}

function mountAllAnchors() {
  document.body.innerHTML = ONBOARDING_STEPS
    .map(s => `<div ${s.target.slice(1, -1)}></div>`)
    .join('')
}

function makeOptions(overrides: Partial<Parameters<typeof useOnboardingTour>[0]> = {}) {
  return {
    steps: ONBOARDING_STEPS,
    stage: vi.fn(() => Promise.resolve()),
    cleanup: vi.fn(),
    saveTourStep: vi.fn(() => Promise.resolve()),
    dismissTourAtSignIn: vi.fn(() => Promise.resolve()),
    canAutoStart: vi.fn(() => true),
    getResumeStep: vi.fn(() => 0),
    // Tiny pacing so real-timer tests stay fast (prod defaults are >1s/step).
    pace: { holdMs: 20, glideMs: 20, fadeMs: 0 },
    ...overrides,
  }
}

beforeEach(() => {
  driverInstances.length = 0
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('useOnboardingTour — auto-start welcome gate', () => {
  it('does NOT open the welcome when the gate is closed', async () => {
    const opts = makeOptions({ canAutoStart: vi.fn(() => false) })
    const tour = useOnboardingTour(opts)
    tour.maybeStartTour()
    await flush()

    expect(tour.showWelcome.value).toBe(false)
    expect(opts.dismissTourAtSignIn).not.toHaveBeenCalled()
    expect(driverInstances).toHaveLength(0)
    expect(tour.isRunning.value).toBe(false)
  })

  it('opens the welcome when the gate is open — without starting or flipping the gate', async () => {
    mountAllAnchors()
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)
    tour.maybeStartTour()
    await flush()

    expect(tour.showWelcome.value).toBe(true)
    expect(tour.isRunning.value).toBe(false)
    expect(driverInstances).toHaveLength(0)
    expect(opts.dismissTourAtSignIn).not.toHaveBeenCalled()
  })

  it('does not reopen the welcome while it is already showing', async () => {
    mountAllAnchors()
    const tour = useOnboardingTour(makeOptions())
    tour.maybeStartTour()
    await flush()
    tour.maybeStartTour()
    await flush()

    expect(tour.showWelcome.value).toBe(true)
    expect(driverInstances).toHaveLength(0)
  })

  it('start: begins the tour at the resume step and flips the gate off', async () => {
    mountAllAnchors()
    const opts = makeOptions({ getResumeStep: vi.fn(() => 2) })
    const tour = useOnboardingTour(opts)
    tour.maybeStartTour()
    await flush()
    tour.startFromWelcome()
    await flush()

    expect(tour.showWelcome.value).toBe(false)
    expect(tour.isRunning.value).toBe(true)
    expect(opts.dismissTourAtSignIn).toHaveBeenCalledTimes(1)
    expect(popoverTitle()).toBe(ONBOARDING_STEPS[2].titleKey)
  })

  it('skip for now: closes the welcome but leaves the gate untouched', async () => {
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)
    tour.maybeStartTour()
    await flush()
    tour.skipWelcome()

    expect(tour.showWelcome.value).toBe(false)
    expect(tour.isRunning.value).toBe(false)
    expect(opts.dismissTourAtSignIn).not.toHaveBeenCalled()
    expect(driverInstances).toHaveLength(0)
  })

  it('don\'t show again: closes the welcome and flips the gate off', async () => {
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)
    tour.maybeStartTour()
    await flush()
    tour.dismissWelcome()

    expect(tour.showWelcome.value).toBe(false)
    expect(tour.isRunning.value).toBe(false)
    expect(opts.dismissTourAtSignIn).toHaveBeenCalledTimes(1)
    expect(driverInstances).toHaveLength(0)
  })
})

describe('useOnboardingTour — resume + clamp', () => {
  it('resumes at the given step index', async () => {
    mountAllAnchors()
    const tour = useOnboardingTour(makeOptions())
    tour.startTour(2)
    await flush()

    expect(tour.currentIndex.value).toBe(2)
    expect(popoverTitle()).toBe(ONBOARDING_STEPS[2].titleKey)
  })

  it('clamps an out-of-range high index to the last step', async () => {
    mountAllAnchors()
    const tour = useOnboardingTour(makeOptions())
    tour.startTour(99)
    await flush()

    expect(tour.currentIndex.value).toBe(LAST)
  })

  it('clamps a negative index to 0', async () => {
    mountAllAnchors()
    const tour = useOnboardingTour(makeOptions())
    tour.startTour(-5)
    await flush()

    expect(tour.currentIndex.value).toBe(0)
  })
})

describe('useOnboardingTour — banner navigation', () => {
  it('exposes the total step count', () => {
    const tour = useOnboardingTour(makeOptions())
    expect(tour.totalSteps).toBe(ONBOARDING_STEPS.length)
  })

  it('next advances and back returns, re-staging each step', async () => {
    mountAllAnchors()
    const tour = useOnboardingTour(makeOptions())
    tour.startTour(0)
    await flush()
    expect(tour.currentIndex.value).toBe(0)

    tour.next()
    await flush()
    expect(tour.currentIndex.value).toBe(1)

    tour.back()
    await flush()
    expect(tour.currentIndex.value).toBe(0)
  })

  it('back at step 0 is a no-op (does not go negative)', async () => {
    mountAllAnchors()
    const tour = useOnboardingTour(makeOptions())
    tour.startTour(0)
    await flush()

    tour.back()
    await flush()

    expect(tour.currentIndex.value).toBe(0)
  })
})

describe('useOnboardingTour — persistence', () => {
  it('persists the current index when dismissed mid-tour', async () => {
    mountAllAnchors()
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)
    tour.startTour(2)
    await flush()

    tour.finish()
    await flush() // the overlay fades out before the driver is destroyed

    expect(opts.saveTourStep).toHaveBeenCalledWith(2)
    expect(lastDriver().destroyed).toBe(true)
    expect(tour.isRunning.value).toBe(false)
  })

  it('resets the resume point to 0 when advancing past the final step', async () => {
    mountAllAnchors()
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)
    tour.startTour(LAST)
    await flush()

    tour.next()
    await flush()

    expect(opts.saveTourStep).toHaveBeenCalledWith(0)
    expect(lastDriver().destroyed).toBe(true)
  })

  it('fires onCompleted only when the tour runs to the end', async () => {
    mountAllAnchors()
    const onCompleted = vi.fn()
    const tour = useOnboardingTour(makeOptions({ onCompleted }))
    tour.startTour(LAST)
    await flush()

    tour.next() // advance past the last step → completed
    await flush()

    expect(onCompleted).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onCompleted on an early "Finish tour" dismissal', async () => {
    mountAllAnchors()
    const onCompleted = vi.fn()
    const tour = useOnboardingTour(makeOptions({ onCompleted }))
    tour.startTour(0)
    await flush()

    tour.finish() // dismissed before the final step
    await flush()

    expect(onCompleted).not.toHaveBeenCalled()
  })
})

describe('useOnboardingTour — missing target', () => {
  it('skips a step whose target is absent rather than erroring', async () => {
    // Only the second step's target exists; step 0 is absent so it must skip.
    // A missing target resolves only after `waitForElement`'s timeout, so drive
    // timers rather than waiting wall-clock.
    vi.useFakeTimers()
    document.body.innerHTML = `<div ${ONBOARDING_STEPS[1].target.slice(1, -1)}></div>`
    const tour = useOnboardingTour(makeOptions())
    tour.startTour(0)
    await vi.advanceTimersByTimeAsync(2100)
    vi.useRealTimers()

    expect(tour.currentIndex.value).toBe(1)
    expect(popoverTitle()).toBe(ONBOARDING_STEPS[1].titleKey)
  })

  // GAP VERIFIER: passes only once `waitForElement` actually polls. The target
  // is inserted on the next macrotask (simulating an overlay animating in).
  // Un-skip this after filling the gap in use-onboarding-tour.ts.
  it('awaits a target that appears shortly after staging', async () => {
    const opts = makeOptions({
      stage: vi.fn(() => {
        setTimeout(() => {
          document.body.innerHTML = `<div ${ONBOARDING_STEPS[0].target.slice(1, -1)}></div>`
        }, 20)
        return Promise.resolve()
      }),
    })
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    // Generous: highlight waits ~80 ms position-stability after the 20 ms insert.
    await flush()

    expect(popoverTitle()).toBe(ONBOARDING_STEPS[0].titleKey)
  })
})

describe('useOnboardingTour — staging spotlights', () => {
  it('should glide one persistent mask from the waypoint to the target instead of re-creating it', async () => {
    vi.useFakeTimers()
    document.body.innerHTML
      = `<button data-tour="open-menu"></button><div ${ONBOARDING_STEPS[0].target.slice(1, -1)}></div>`
    const opts = makeOptions({
      stage: vi.fn(async (_s, ctx) => {
        await ctx.spotlight('[data-tour="open-menu"]')
      }),
    })
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    await vi.advanceTimersByTimeAsync(3000)
    vi.useRealTimers()

    expect(driverInstances).toHaveLength(1)
    const d = lastDriver()
    const target = document.querySelector(ONBOARDING_STEPS[0].target)
    expect(d.highlighted[0].element).toBe(document.querySelector('[data-tour="open-menu"]'))
    expect(d.highlighted[0].popover).toBeUndefined() // no hintKey → bare spotlight
    // The waypoint is frozen on the anchor before it is actuated (it may unmount).
    expect(d.highlighted[1].element.classList.contains('onboarding-tour-anchor')).toBe(true)
    // Two-phase reveal on the target: glide in without copy, then the popover.
    expect(d.highlighted.at(-2).element).toBe(target)
    expect(d.highlighted.at(-2).popover).toBeUndefined()
    expect(popoverTitle(d)).toBe(ONBOARDING_STEPS[0].titleKey)
    expect(d.destroyed).toBe(false)
  })

  it('should not re-stage when the next step is on the surface already on screen', async () => {
    const steps = [
      { ...ONBOARDING_STEPS[0], surface: 'profile' as const, target: '[data-tour="a"]' },
      { ...ONBOARDING_STEPS[1], surface: 'profile' as const, target: '[data-tour="b"]' },
      { ...ONBOARDING_STEPS[2], surface: 'contacts' as const, target: '[data-tour="c"]' },
    ]
    document.body.innerHTML = '<div data-tour="a"></div><div data-tour="b"></div><div data-tour="c"></div>'
    const opts = makeOptions({ steps })
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    await flush()
    tour.next()
    await flush()
    tour.next()
    await flush()

    expect(vi.mocked(opts.stage).mock.calls.map(c => [c[0], c[2]])).toEqual([
      ['profile', null],
      ['contacts', 'profile'], // `from` lets the host take the short path
    ])
  })

  it('should re-stage from scratch after a restart, even on the same surface', async () => {
    mountAllAnchors()
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    await flush()
    tour.finish()
    tour.startTour(0)
    await flush()

    expect(opts.stage).toHaveBeenCalledTimes(2)
    expect(vi.mocked(opts.stage).mock.calls[1][2]).toBeNull()
  })

  it('should not let a finished tour\'s delayed destroy tear down a tour started right after', async () => {
    mountAllAnchors()
    const tour = useOnboardingTour(makeOptions({ pace: { holdMs: 20, glideMs: 20, fadeMs: 200 } }))
    tour.startTour(0)
    await flush()
    const first = lastDriver()
    tour.finish() // fade-out pending
    tour.startTour(0)
    await flush()

    expect(first.destroyed).toBe(true) // flushed before the new driver was made
    expect(driverInstances).toHaveLength(2)
    expect(lastDriver().destroyed).toBe(false)
  })

  it('attaches a hint popover to a waypoint when a hintKey is given', async () => {
    vi.useFakeTimers()
    document.body.innerHTML
      = `<button data-tour="open-menu"></button><div ${ONBOARDING_STEPS[0].target.slice(1, -1)}></div>`
    const opts = makeOptions({
      stage: vi.fn(async (_s, ctx) => {
        await ctx.spotlight('[data-tour="open-menu"]', 'onboarding.tour.nav.openMenu')
      }),
    })
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    await vi.advanceTimersByTimeAsync(3000)
    vi.useRealTimers()

    const hint = lastDriver().highlighted.find(h => h.popover?.description === 'onboarding.tour.nav.openMenu')
    // Hint popover: description only (mocked t echoes the key), no title.
    expect(hint?.element).toBe(document.querySelector('[data-tour="open-menu"]'))
    expect(hint?.popover?.title).toBeUndefined()
  })

  it('skips a spotlight whose control never appears, still highlighting the target', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = `<div ${ONBOARDING_STEPS[0].target.slice(1, -1)}></div>`
    const opts = makeOptions({
      stage: vi.fn(async (_s, ctx) => {
        await ctx.spotlight('[data-tour="never-here"]')
      }),
    })
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    await vi.advanceTimersByTimeAsync(3000)
    vi.useRealTimers()

    expect(driverInstances).toHaveLength(1)
    const hl = lastDriver().highlighted
    // Two-phase reveal: spotlight-only, then the popover.
    expect(hl).toHaveLength(2)
    expect(hl[0].popover).toBeUndefined()
    expect(popoverTitle()).toBe(ONBOARDING_STEPS[0].titleKey)
  })
})

describe('useOnboardingTour — teardown cleanup gating', () => {
  // Regression: stop() runs on every host route-leave/unmount. cleanup may
  // navigate (calendar returns to planned), so firing it when no tour/welcome
  // was up hijacks the unrelated navigation (seasons→tour detail bounced to
  // planned on mobile).
  it('does NOT run cleanup when stopped while idle', () => {
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)

    tour.stop()

    expect(opts.cleanup).not.toHaveBeenCalled()
  })

  it('runs cleanup when stopped while a tour is running', async () => {
    mountAllAnchors()
    const opts = makeOptions()
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    await flush()

    tour.stop()

    expect(opts.cleanup).toHaveBeenCalledTimes(1)
  })
})

describe('useOnboardingTour — finishing mid-staging', () => {
  // A stage that spotlights a waypoint, then opens the next surface — like the
  // map's "open menu → open contacts" path.
  function stagingOptions(opened: () => void) {
    return makeOptions({
      stage: vi.fn(async (_surface, ctx) => {
        await ctx.spotlight('[data-tour="waypoint"]')
        opened()
      }),
    })
  }

  beforeEach(() => {
    mountAllAnchors()
    document.body.insertAdjacentHTML('beforeend', '<div data-tour="waypoint"></div>')
  })

  it('should not open the next surface when the tour is finished during a waypoint', async () => {
    const opened = vi.fn()
    const opts = stagingOptions(opened)
    const tour = useOnboardingTour(opts)
    tour.startTour(0)
    tour.finish()
    await flush()
    expect(opened).not.toHaveBeenCalled()
    expect(tour.isStaging.value).toBe(false)
  })

  it('should not let a finished run keep staging after the tour is restarted', async () => {
    const opened = vi.fn()
    const tour = useOnboardingTour(stagingOptions(opened))
    tour.startTour(0)
    tour.finish()
    tour.startTour(0)
    await flush()
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('should fire onDismissed on an early finish but not on a route-leave stop', async () => {
    const onDismissed = vi.fn()
    const tour = useOnboardingTour(makeOptions({ onDismissed }))
    tour.startTour(0)
    await flush()
    tour.stop()
    expect(onDismissed).not.toHaveBeenCalled()
    tour.startTour(0)
    await flush()
    tour.finish()
    expect(onDismissed).toHaveBeenCalledOnce()
  })
})
