import { describe, expect, it } from 'vitest'
import { toEmailLocale } from '@/core/i18n/to-email-locale'

describe('toEmailLocale', () => {
  it('maps de-CH to de', () => {
    expect(toEmailLocale('de-CH')).toBe('de')
  })

  it('maps en to en', () => {
    expect(toEmailLocale('en')).toBe('en')
  })

  it('maps de to de', () => {
    expect(toEmailLocale('de')).toBe('de')
  })

  it('maps de-AT to de', () => {
    expect(toEmailLocale('de-AT')).toBe('de')
  })

  it('maps unknown code to en', () => {
    expect(toEmailLocale('fr-CH')).toBe('en')
  })

  it('maps empty string to en', () => {
    expect(toEmailLocale('')).toBe('en')
  })
})
