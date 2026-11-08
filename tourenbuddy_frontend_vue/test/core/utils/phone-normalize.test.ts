import { describe, expect, it } from 'vitest'
import { formatPhoneForDisplay, normalizePhone } from '@/core/utils/phone-normalize'

describe('normalizePhone', () => {
  it('normalizes Swiss national number to E.164', () => {
    const result = normalizePhone('0791234567')
    expect(result).toEqual({ ok: true, e164: '+41791234567' })
  })

  it('normalizes Swiss national number with spaces to E.164', () => {
    const result = normalizePhone('079 123 45 67')
    expect(result).toEqual({ ok: true, e164: '+41791234567' })
  })

  it('normalizes plus-prefixed E.164 number', () => {
    const result = normalizePhone('+41791234567')
    expect(result).toEqual({ ok: true, e164: '+41791234567' })
  })

  it('normalizes plus-prefixed number with spaces', () => {
    const result = normalizePhone('+41 79 123 45 67')
    expect(result).toEqual({ ok: true, e164: '+41791234567' })
  })

  it('normalizes 00-prefixed international number', () => {
    const result = normalizePhone('0041 79 123 45 67')
    expect(result).toEqual({ ok: true, e164: '+41791234567' })
  })

  it('normalizes foreign number with country code', () => {
    const result = normalizePhone('+33 6 12 34 56 78')
    expect(result).toEqual({ ok: true, e164: '+33612345678' })
  })

  it('normalizes foreign national number with override region', () => {
    const result = normalizePhone('0612345678', 'FR')
    expect(result).toEqual({ ok: true, e164: '+33612345678' })
  })

  it('normalizes German number', () => {
    const result = normalizePhone('+49 30 1234567')
    expect(result).toEqual({ ok: true, e164: '+49301234567' })
  })

  it('returns ok: false for unparseable input', () => {
    const result = normalizePhone('not a number')
    expect(result).toEqual({ ok: false, raw: 'not a number' })
  })

  it('returns ok: false for extension-only string', () => {
    const result = normalizePhone('ext. 1234')
    expect(result).toEqual({ ok: false, raw: 'ext. 1234' })
  })

  it('returns ok: false for empty string', () => {
    const result = normalizePhone('')
    expect(result).toEqual({ ok: false, raw: '' })
  })

  it('returns ok: false for whitespace-only string', () => {
    const result = normalizePhone('   ')
    expect(result).toEqual({ ok: false, raw: '' })
  })

  it('returns ok: false for null', () => {
    const result = normalizePhone(null)
    expect(result).toEqual({ ok: false, raw: '' })
  })

  it('returns ok: false for undefined', () => {
    const result = normalizePhone(undefined)
    expect(result).toEqual({ ok: false, raw: '' })
  })

  it('returns ok: false for too-short number', () => {
    const result = normalizePhone('123')
    expect(result.ok).toBe(false)
  })
})

describe('formatPhoneForDisplay', () => {
  it('formats E.164 to spaced international', () => {
    expect(formatPhoneForDisplay('+41791234567')).toBe('+41 79 123 45 67')
  })

  it('formats national number via default CH region', () => {
    expect(formatPhoneForDisplay('0791234567')).toBe('+41 79 123 45 67')
  })

  it('formats spaced international input', () => {
    expect(formatPhoneForDisplay('+41 79 123 45 67')).toBe('+41 79 123 45 67')
  })

  it('formats German number', () => {
    expect(formatPhoneForDisplay('+49301234567')).toBe('+49 30 1234567')
  })

  it('passes through unparseable string', () => {
    expect(formatPhoneForDisplay('ext. 1234')).toBe('ext. 1234')
  })

  it('returns empty string for null', () => {
    expect(formatPhoneForDisplay(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatPhoneForDisplay(undefined)).toBe('')
  })
})
