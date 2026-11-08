import { describe, expect, it } from 'vitest'
import { userProfileRowSchema } from '@/features/user/data/models/user-profile-schema'

describe('userProfileRowSchema', () => {
  const baseRow = { id: 'u1', first_name: 'Max', last_name: 'M' }

  it('should map locale en', () => {
    const result = userProfileRowSchema.parse({ ...baseRow, locale: 'en' })
    expect(result.locale).toBe('en')
  })

  it('should map locale de-CH', () => {
    const result = userProfileRowSchema.parse({ ...baseRow, locale: 'de-CH' })
    expect(result.locale).toBe('de-CH')
  })

  it('should allow null locale', () => {
    const result = userProfileRowSchema.parse({ ...baseRow, locale: null })
    expect(result.locale).toBeNull()
  })

  it('should coerce undefined locale to null', () => {
    const result = userProfileRowSchema.parse(baseRow)
    expect(result.locale).toBeNull()
  })

  it('should reject unsupported locale code', () => {
    expect(() => userProfileRowSchema.parse({ ...baseRow, locale: 'fr' })).toThrow()
  })

  it('should default the calendar feature notice gate to false', () => {
    const result = userProfileRowSchema.parse(baseRow)
    expect(result.calendarFeatureNoticeShowAtSignIn).toBe(false)
  })
})
