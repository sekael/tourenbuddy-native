import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectLocale } from '@/core/i18n/detect'

function mockLanguages(languages: string[]) {
  Object.defineProperty(navigator, 'languages', {
    get: () => languages,
    configurable: true,
  })
}

describe('detectLocale', () => {
  beforeEach(() => {
    mockLanguages([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns exact supported locale when matched', () => {
    mockLanguages(['de-CH', 'en'])
    expect(detectLocale()).toBe('de-CH')
  })

  it('returns en when first language is en', () => {
    mockLanguages(['en', 'de-CH'])
    expect(detectLocale()).toBe('en')
  })

  it('falls back to de-CH when de-AT is first', () => {
    mockLanguages(['de-AT'])
    expect(detectLocale()).toBe('de-CH')
  })

  it('falls back to de-CH for any de-* variant', () => {
    mockLanguages(['de-DE'])
    expect(detectLocale()).toBe('de-CH')
  })

  it('returns en when no match found', () => {
    mockLanguages(['ja', 'zh-CN'])
    expect(detectLocale()).toBe('en')
  })

  it('returns en when languages list is empty', () => {
    mockLanguages([])
    expect(detectLocale()).toBe('en')
  })

  it('checks subsequent languages if first does not match', () => {
    mockLanguages(['ja', 'de-CH'])
    expect(detectLocale()).toBe('de-CH')
  })
})
