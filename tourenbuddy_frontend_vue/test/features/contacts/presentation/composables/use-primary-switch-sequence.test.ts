import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { PRIMARY_FADE_MS, PRIMARY_MOVE_MS, usePrimarySwitchSequence } from '@/features/contacts/presentation/composables/use-primary-switch-sequence'

const motion = ref<'reduce' | 'no-preference'>('no-preference')
vi.mock('@vueuse/core', async importOriginal => ({
  ...await importOriginal<typeof import('@vueuse/core')>(),
  usePreferredReducedMotion: () => motion,
}))

function setup(initial: string | null) {
  const target = ref<string | null>(initial)
  const scope = effectScope()
  const seq = scope.run(() => usePrimarySwitchSequence(target))!
  const state = () => [seq.orderId.value, seq.highlightId.value]
  return { target, scope, state }
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('usePrimarySwitchSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    motion.value = 'no-preference'
  })
  afterEach(() => vi.useRealTimers())

  it('should fade the old highlight out before reordering, and fade the new one in after the move', async () => {
    const { target, state } = setup('a')
    target.value = 'b'
    await nextTick()
    expect(state()).toEqual(['a', null])
    await advance(PRIMARY_FADE_MS)
    expect(state()).toEqual(['b', null])
    await advance(PRIMARY_MOVE_MS - 1)
    expect(state()).toEqual(['b', null])
    await advance(1)
    expect(state()).toEqual(['b', 'b'])
  })

  it('should skip the move when the switch is reverted before the rows moved (failed save)', async () => {
    const { target, state } = setup('a')
    target.value = 'b'
    await nextTick()
    await advance(PRIMARY_FADE_MS / 2)
    target.value = 'a'
    await nextTick()
    await advance(PRIMARY_FADE_MS)
    expect(state()).toEqual(['a', 'a'])
    await advance(PRIMARY_MOVE_MS)
    expect(state()).toEqual(['a', 'a'])
  })

  it('should switch at once under reduced motion', async () => {
    motion.value = 'reduce'
    const { target, state } = setup('a')
    target.value = 'b'
    await nextTick()
    expect(state()).toEqual(['b', 'b'])
  })

  it('should show a first primary at once, with nothing to fade out', async () => {
    const { target, state } = setup(null)
    target.value = 'a'
    await nextTick()
    expect(state()).toEqual(['a', 'a'])
  })

  it('should stop mid-sequence once its scope is disposed', async () => {
    const { target, scope, state } = setup('a')
    target.value = 'b'
    await nextTick()
    scope.stop()
    await advance(PRIMARY_FADE_MS + PRIMARY_MOVE_MS)
    expect(state()).toEqual(['a', null])
  })
})
