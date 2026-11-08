import { describe, expect, it } from 'vitest'
import { parseContactName } from '@/features/contacts/core/utils/parse-contact-name'

describe('parseContactName', () => {
  it('should split two-part name into firstName and lastName', () => {
    expect(parseContactName('Max Muster')).toEqual({ firstName: 'Max', lastName: 'Muster' })
  })

  it('should return null lastName for single name', () => {
    expect(parseContactName('Max')).toEqual({ firstName: 'Max', lastName: null })
  })

  it('should join remaining tokens into lastName for multi-part names', () => {
    expect(parseContactName('Max von Muster')).toEqual({ firstName: 'Max', lastName: 'von Muster' })
  })

  it('should handle extra whitespace', () => {
    expect(parseContactName('  Anna   Müller  ')).toEqual({ firstName: 'Anna', lastName: 'Müller' })
  })

  it('should handle four-part name', () => {
    expect(parseContactName('Jean Claude Van Damme')).toEqual({
      firstName: 'Jean',
      lastName: 'Claude Van Damme',
    })
  })
})
