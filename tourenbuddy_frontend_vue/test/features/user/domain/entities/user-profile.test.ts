import { describe, expect, it } from 'vitest'
import { isProfileComplete } from '@/features/user/domain/entities/user-profile'

describe('isProfileComplete', () => {
  it('should return false when firstName is null', () => {
    expect(isProfileComplete({ firstName: null, lastName: 'Doe' })).toBe(false)
  })

  it('should return false when lastName is null', () => {
    expect(isProfileComplete({ firstName: 'John', lastName: null })).toBe(false)
  })

  it('should return false when both firstName and lastName are null', () => {
    expect(isProfileComplete({ firstName: null, lastName: null })).toBe(false)
  })

  it('should return true when firstName and lastName are set', () => {
    expect(isProfileComplete({ firstName: 'John', lastName: 'Doe' })).toBe(true)
  })
})
