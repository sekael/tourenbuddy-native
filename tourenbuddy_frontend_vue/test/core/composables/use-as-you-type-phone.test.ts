import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useAsYouTypePhone } from '@/core/composables/use-as-you-type-phone'

describe('useAsYouTypePhone', () => {
  it('returns empty string when raw is empty', () => {
    const raw = ref('')
    const { formatted } = useAsYouTypePhone(raw)
    expect(formatted.value).toBe('')
  })

  it('formats Swiss national number progressively', () => {
    const raw = ref('')
    const { formatted } = useAsYouTypePhone(raw)

    raw.value = '0'
    expect(formatted.value).toBe('0')

    raw.value = '079'
    expect(formatted.value).toBe('079')

    raw.value = '0791'
    expect(formatted.value).toBe('079 1')

    raw.value = '0791234567'
    expect(formatted.value).toBe('079 123 45 67')
  })

  it('formats plus-prefixed international number', () => {
    const raw = ref('+41791234567')
    const { formatted } = useAsYouTypePhone(raw)
    expect(formatted.value).toBe('+41 79 123 45 67')
  })

  it('formats partial plus-prefixed number progressively', () => {
    const raw = ref('')
    const { formatted } = useAsYouTypePhone(raw)

    raw.value = '+'
    expect(formatted.value).toBe('+')

    raw.value = '+41'
    expect(formatted.value).toBe('+41')

    raw.value = '+4179'
    expect(formatted.value).toBe('+41 79')

    raw.value = '+41791234567'
    expect(formatted.value).toBe('+41 79 123 45 67')
  })

  it('formats pasted canonical value correctly', () => {
    const raw = ref('+41 79 123 45 67')
    const { formatted } = useAsYouTypePhone(raw)
    expect(formatted.value).toBe('+41 79 123 45 67')
  })

  it('reacts to rawRef changes', () => {
    const raw = ref('0791234567')
    const { formatted } = useAsYouTypePhone(raw)
    expect(formatted.value).toBe('079 123 45 67')

    raw.value = ''
    expect(formatted.value).toBe('')
  })
})
