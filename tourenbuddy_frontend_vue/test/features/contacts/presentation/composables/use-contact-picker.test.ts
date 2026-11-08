import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Contact Picker API is a browser-only API not available in happy-dom.
 * `isContactPickerSupported` is a module-level const evaluated at import time,
 * so it's always false in tests. We test the internal processing logic by importing
 * the composable after stubbing globals, resetting the module registry each time.
 */

async function loadPickerWithMockedApi(
  entries: Array<{ name: string[], tel: string[] }>,
) {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      ...globalThis.navigator,
      contacts: {
        select: vi.fn().mockResolvedValue(entries),
      },
    },
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: { ...globalThis.window, ContactsManager: {} },
    configurable: true,
    writable: true,
  })
  vi.resetModules()
  return import('@/features/contacts/presentation/composables/use-contact-picker')
}

describe('useContactPicker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('duplicate tel values collapse with isPrimary: true retained', async () => {
    const { useContactPicker } = await loadPickerWithMockedApi([
      { name: ['Test User'], tel: ['+41 79 123 45 67', '+41791234567'] },
    ])
    const { pickContacts } = useContactPicker()
    const result = await pickContacts()
    expect(result[0]!.phones).toHaveLength(1)
    expect(result[0]!.phones[0]!.isPrimary).toBe(true)
    expect(result[0]!.phones[0]!.value).toBe('+41791234567')
  })

  it('unparseable tel goes to rawPhoneNumbers, not phones', async () => {
    const { useContactPicker } = await loadPickerWithMockedApi([
      { name: ['Test User'], tel: ['ext. 1234'] },
    ])
    const { pickContacts } = useContactPicker()
    const result = await pickContacts()
    expect(result[0]!.phones).toHaveLength(0)
    expect(result[0]!.rawPhoneNumbers).toEqual(['ext. 1234'])
  })

  it('returns empty array on API error (cancel)', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        contacts: {
          select: vi.fn().mockRejectedValue(new DOMException('AbortError')),
        },
      },
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: { ...globalThis.window, ContactsManager: {} },
      configurable: true,
      writable: true,
    })
    vi.resetModules()
    const { useContactPicker } = await import('@/features/contacts/presentation/composables/use-contact-picker')
    const { pickContacts } = useContactPicker()
    const result = await pickContacts()
    expect(result).toEqual([])
  })
})
