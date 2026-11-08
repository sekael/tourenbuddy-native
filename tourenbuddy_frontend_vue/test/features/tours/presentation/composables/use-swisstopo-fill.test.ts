import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useSwisstopoFill } from '@/features/tours/presentation/composables/use-swisstopo-fill'

describe('useSwisstopoFill', () => {
  it('should set a value it was handed at once, never blank in between (the next day reads it right away)', () => {
    const field = ref('2207')
    const fill = useSwisstopoFill(field)
    void fill.fill(() => 2500)
    expect(field.value).toBe('2500')
    expect(fill.status).toBe('idle')
  })
})
