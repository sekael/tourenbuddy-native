import { describe, expect, it } from 'vitest'
import { formatPhoneDisplay, getPrimaryPhone } from '@/features/contacts/domain/entities/contact'

function makeContact(methods: Array<{ id: string, value: string, isPrimary: boolean }>) {
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
      methodType: 'phone' as const,
      label: null,
      isValid: true,
    })),
  }
}

describe('getPrimaryPhone', () => {
  it('returns primary phone when explicitly marked', () => {
    const contact = makeContact([
      { id: 'm1', value: '+41 79 111 11 11', isPrimary: false },
      { id: 'm2', value: '+41 79 222 22 22', isPrimary: true },
    ])
    expect(getPrimaryPhone(contact)).toBe('+41 79 222 22 22')
  })

  it('falls back to first phone when none marked primary (legacy)', () => {
    const contact = makeContact([
      { id: 'm1', value: '+41 79 111 11 11', isPrimary: false },
      { id: 'm2', value: '+41 79 222 22 22', isPrimary: false },
    ])
    expect(getPrimaryPhone(contact)).toBe('+41 79 111 11 11')
  })

  it('returns null when no phones', () => {
    const contact = makeContact([])
    expect(getPrimaryPhone(contact)).toBeNull()
  })
})

describe('formatPhoneDisplay', () => {
  it('normalizes legacy 00-prefix to canonical international form', () => {
    expect(formatPhoneDisplay('0041791234567')).toBe('+41 79 123 45 67')
  })

  it('normalizes legacy local Swiss number', () => {
    expect(formatPhoneDisplay('0791234567')).toBe('+41 79 123 45 67')
  })

  it('normalizes already-canonical form (idempotent)', () => {
    expect(formatPhoneDisplay('+41 79 123 45 67')).toBe('+41 79 123 45 67')
  })

  it('normalizes unspaced E.164 form', () => {
    expect(formatPhoneDisplay('+41791234567')).toBe('+41 79 123 45 67')
  })

  it('falls back to trimmed original for unrecognized values', () => {
    expect(formatPhoneDisplay('ext. 1234')).toBe('ext. 1234')
  })

  it('trims whitespace from unrecognized fallback', () => {
    expect(formatPhoneDisplay('  ext. 1234  ')).toBe('ext. 1234')
  })
})
