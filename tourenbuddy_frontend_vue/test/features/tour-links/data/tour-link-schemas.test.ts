import { describe, expect, it } from 'vitest'
import {
  tourLinkMemberRowSchema,
  tourLinkRequestRowSchema,
  tourLinkRequestStatusSchema,
} from '@/features/tour-links/data/models/tour-link-schemas'

describe('tour-link schemas', () => {
  it('rejects an unknown status', () => {
    expect(() => tourLinkRequestStatusSchema.parse('foo')).toThrow()
  })

  it('rejects a member row missing joined_at', () => {
    expect(() =>
      tourLinkMemberRowSchema.parse({ group_id: 'g', tour_id: 't' }),
    ).toThrow()
  })

  it('parses null resolved_at on a pending request', () => {
    const parsed = tourLinkRequestRowSchema.parse({
      id: 'r1',
      initiator_tour_id: 'a',
      target_tour_id: 'b',
      status: 'pending',
      created_at: '2026-05-28T00:00:00Z',
      resolved_at: null,
    })
    expect(parsed.resolvedAt).toBeNull()
    expect(parsed.createdAt).toBeInstanceOf(Date)
  })
})
