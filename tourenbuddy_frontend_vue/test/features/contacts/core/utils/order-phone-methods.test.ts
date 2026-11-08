import { describe, expect, it } from 'vitest'
import { orderedPhoneMethods } from '@/features/contacts/core/utils/order-phone-methods'

function makeContact(
  methods: Array<{ id: string, methodType: 'phone' | 'email', isPrimary: boolean }>,
) {
  return {
    id: 'c1',
    userId: 'u1',
    firstName: 'Test',
    lastName: null,
    displayName: null,
    updatedAt: null,
    contactMethods: methods.map(m => ({
      ...m,
      contactId: 'c1',
      value: `+41 79 ${m.id}`,
      label: null,
      isValid: true,
    })),
  }
}

describe('orderedPhoneMethods', () => {
  it('returns primary phone first', () => {
    const contact = makeContact([
      { id: '1', methodType: 'phone', isPrimary: false },
      { id: '2', methodType: 'phone', isPrimary: true },
      { id: '3', methodType: 'phone', isPrimary: false },
    ])
    const ordered = orderedPhoneMethods(contact)
    expect(ordered[0]!.id).toBe('2')
    expect(ordered[1]!.id).toBe('1')
    expect(ordered[2]!.id).toBe('3')
  })

  it('returns phones in insertion order when none is primary', () => {
    const contact = makeContact([
      { id: 'a', methodType: 'phone', isPrimary: false },
      { id: 'b', methodType: 'phone', isPrimary: false },
    ])
    const ordered = orderedPhoneMethods(contact)
    expect(ordered[0]!.id).toBe('a')
    expect(ordered[1]!.id).toBe('b')
  })

  it('excludes email methods', () => {
    const contact = makeContact([
      { id: 'e1', methodType: 'email', isPrimary: false },
      { id: 'p1', methodType: 'phone', isPrimary: true },
    ])
    const ordered = orderedPhoneMethods(contact)
    expect(ordered).toHaveLength(1)
    expect(ordered[0]!.id).toBe('p1')
  })

  it('returns empty array for contact with no phones', () => {
    const contact = makeContact([])
    expect(orderedPhoneMethods(contact)).toHaveLength(0)
  })
})
