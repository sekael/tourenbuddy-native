import type { Contact } from '@/features/contacts/domain/entities/contact'
import { describe, expect, it, vi } from 'vitest'
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name'

// Every surface that names a friend routes through this, each supplying its own fallback —
// so what matters is exactly WHEN it declines to answer.

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c-1',
    firstName: 'Mum',
    lastName: null,
    displayName: null,
    contactMethods: [],
    ...overrides,
  } as Contact
}

describe('resolveFriendName (declines only)', () => {
  it('declines for a null userId without touching the contact lookup', () => {
    const findContact = vi.fn()
    expect(resolveFriendName(null, new Map(), findContact)).toBeNull()
    expect(findContact).not.toHaveBeenCalled()
  })

  it('declines when the user has no known phone, rather than searching blindly', () => {
    const findContact = vi.fn()
    expect(resolveFriendName('user-a', new Map(), findContact)).toBeNull()
    expect(findContact).not.toHaveBeenCalled()
  })

  it('declines when no contact holds that phone — the broken-link state', () => {
    const map = new Map([['user-a', '+41791111111']])
    expect(resolveFriendName('user-a', map, () => undefined)).toBeNull()
  })

  it('declines a whitespace-only contact name instead of rendering a blank label', () => {
    const map = new Map([['user-a', '+41791111111']])
    expect(resolveFriendName('user-a', map, () => contact({ firstName: '   ' }))).toBeNull()
  })

  it('prefers the display name a contact was explicitly saved under', () => {
    const map = new Map([['user-a', '+41791111111']])
    const found = contact({ firstName: 'Anna', lastName: 'Meier', displayName: 'Mum' })
    expect(resolveFriendName('user-a', map, () => found)).toBe('Mum')
  })
})
