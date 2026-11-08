import { describe, expect, it } from 'vitest'
import { INBOX_ACTIONS, inboxText } from '@/features/notifications/presentation/inbox-text'
import deCH from '@/locales/de-CH.json'
import en from '@/locales/en.json'

describe('inbox text', () => {
  it.each([['en', en], ['de-CH', deCH]])('should have a %s string for every emitted action', (_, locale) => {
    const entries = (locale as { inbox: { entry: Record<string, string> } }).inbox.entry
    const missing = [...INBOX_ACTIONS, 'unknown'].filter(a => !entries[a])
    expect(missing).toEqual([])
  })

  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key)
  const entry = (action: string, ref: Record<string, unknown>) => ({ action, ref }) as never

  it('should name one friend without a count', () => {
    expect(inboxText(entry('weekly', { friend_ids: ['a'] }), t, 'Anna')).toBe('inbox.entry.weekly {"actor":"Anna","count":0}')
  })

  it('should count the friends beyond the named one', () => {
    expect(inboxText(entry('weekly', { friend_ids: ['a', 'b', 'c'] }), t, 'Anna')).toBe('inbox.entry.weeklyMore {"actor":"Anna","count":2}')
  })

  it('should fall back to "someone" for a summary without friend ids', () => {
    expect(inboxText(entry('weekly', {}), t, null)).toBe('inbox.entry.weekly {"actor":"inbox.someone","count":0}')
  })

  it('should title a release note this build no longer contains generically', () => {
    expect(inboxText(entry('published', { note_id: 'gone-note' }), t)).toBe('inbox.entry.publishedUnknown')
  })
})
