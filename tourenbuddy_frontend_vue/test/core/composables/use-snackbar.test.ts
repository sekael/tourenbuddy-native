import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useSnackbar, useSnackbarSlot } from '@/core/composables/use-snackbar'

describe('useSnackbar', () => {
  it('should hide an earlier message when another snackbar shows, so they never overlap', async () => {
    const first = useSnackbar()
    const second = useSnackbar()
    first.show('offline')
    await nextTick()
    second.show('route details need a connection')
    await nextTick()
    expect(first.snackbar.value.visible).toBe(false)
    expect(second.snackbar.value.visible).toBe(true)
  })

  it('should hide a slot member (e.g. the offline explanation) when a snackbar shows', async () => {
    let explain = true
    const claim = useSnackbarSlot(() => explain = false)
    claim()
    await nextTick()
    useSnackbar().show('newer')
    await nextTick()
    expect(explain).toBe(false)
  })

  it('should keep a message visible when the same snackbar shows again', async () => {
    const only = useSnackbar()
    only.show('a')
    await nextTick()
    only.show('b')
    await nextTick()
    expect(only.snackbar.value).toEqual({ visible: true, message: 'b' })
  })
})
