import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SUGGESTABLE_FIELDS,
  tourSuggestionRowSchema,
} from '@/features/tours/data/models/tour-suggestion'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

/**
 * The `field in (...)` list from the newest migration that sets the tour_suggestion field
 * CHECK — the table's inline one, or a later `add constraint tour_suggestion_field_check`.
 */
function sqlFieldEnum(): string[] {
  const check = /(?:field\s+text not null|constraint tour_suggestion_field_check) check \(field in \(([\s\S]*?)\)\)/
  const latest = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(f => readFileSync(join(MIGRATIONS_DIR, f), 'utf8').match(check))
    .filter(match => match != null)
    .at(-1)
  if (!latest)
    throw new Error('field CHECK constraint not found in migrations')

  return [...latest[1]!.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
}

describe('suggestable field enum', () => {
  // The enum lives in exactly two places (design D2) — the SQL CHECK and the Zod enum.
  // A value added to one and not the other is a runtime 23514 in production, so drift
  // fails here instead.
  it('should match the SQL CHECK constraint verbatim, in order', () => {
    expect(sqlFieldEnum()).toEqual([...SUGGESTABLE_FIELDS])
  })

  it('should never expose visibility, completed or the partner set as suggestable', () => {
    // Not merely filtered client-side: visibility is the privacy control itself,
    // completion is the owner's assertion about their own day, and a suggester's contact
    // ids are meaningless in the owner's namespace.
    for (const forbidden of ['visibility', 'completed', 'partner_ids', 'partners'])
      expect(SUGGESTABLE_FIELDS as readonly string[]).not.toContain(forbidden)
  })
})

describe('tourSuggestionRowSchema', () => {
  const row = {
    id: 's1',
    tour_id: 't1',
    owner_id: 'o1',
    suggester_id: 'u1',
    batch_id: 'b1',
    field: 'description',
    status: 'pending',
    created_at: '2026-08-01T10:00:00Z',
  }

  it('should keep an explicit null value distinct from a missing one', () => {
    // A null `value` is a real suggestion ("clear this field", D1) and must survive the
    // transform — collapsing it to undefined would render the row as "no change".
    const parsed = tourSuggestionRowSchema.parse({ ...row, value: null })
    expect(parsed.value).toBeNull()
    expect('value' in parsed).toBe(true)
  })

  it('should reject a field outside the enum', () => {
    expect(() => tourSuggestionRowSchema.parse({ ...row, field: 'visibility' })).toThrow()
  })

  it('should default is_stale to false when the view omits it', () => {
    expect(tourSuggestionRowSchema.parse(row).isStale).toBe(false)
  })

  it('should leave resolvedAt null for a pending row', () => {
    expect(tourSuggestionRowSchema.parse(row).resolvedAt).toBeNull()
  })
})
