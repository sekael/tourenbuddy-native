import { describe, expect, it } from 'vitest'
import { iconRegistry } from '@/core/components/icons'
import { currentReleaseNote, RELEASE_NOTES } from '@/features/notifications/data/release-notes'
import deCH from '@/locales/de-CH.json'
import en from '@/locales/en.json'

describe('release notes registry', () => {
  it('should have no current note when the registry is empty', () => {
    expect(currentReleaseNote([])).toBeNull()
  })

  it('should treat the last entry as current, regardless of id order', () => {
    expect(currentReleaseNote([{ id: 'zz', since: '2026-01-01', features: [] }, { id: 'aa', since: '2026-02-01', features: [] }])?.id).toBe('aa')
  })

  it('should only hold unique ids the RPC accepts, each with a date and full copy in every locale', () => {
    const ids = RELEASE_NOTES.map(n => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const note of RELEASE_NOTES) {
      expect(note.id).toMatch(/^[a-z0-9-]{1,64}$/)
      expect(note.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const locale of [en, deCH] as unknown as Array<{ releaseNotes: Record<string, { title?: string, intro?: string, features?: Record<string, { title?: string, body?: string }> }> }>) {
        const copy = locale.releaseNotes[note.id]
        expect(copy?.title && copy.intro).toBeTruthy()
        for (const f of note.features)
          expect(iconRegistry[f.icon], f.icon).toBeDefined()
        for (const f of note.features)
          expect(copy?.features?.[f.key]?.title && copy.features[f.key]?.body).toBeTruthy()
      }
    }
  })

  it('should append notes in (since, id) order, because the RPC only records a newer note', () => {
    const keys = RELEASE_NOTES.map(n => `${n.since} ${n.id}`)
    expect(keys).toEqual(keys.toSorted())
  })
})
