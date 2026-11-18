import type { UserBlock } from '@/features/friendships/data/models/user-block-schemas';
import { unblockOpensAt } from '@/features/friendships/presentation/stores/user-blocks-store';

const block = (lastBlockedAt: string, unblockedAt: string | null = null) =>
  ({ blockedUserId: 'b', lastBlockedAt, unblockedAt }) as UserBlock;
const now = Date.parse('2026-11-12T12:00:00Z');

describe('unblockOpensAt', () => {
  it('is 48 hours after the block while that is ahead', () => {
    expect(unblockOpensAt(block('2026-11-11T12:00:00Z'), now)).toEqual(
      new Date('2026-11-13T12:00:00Z'),
    );
  });

  it('is null once the 48 hours have passed, to the millisecond', () => {
    expect(unblockOpensAt(block('2026-11-10T12:00:00Z'), now)).toBeNull();
  });

  it('is null for a lifted block or none', () => {
    expect(unblockOpensAt(block('2026-11-12T11:00:00Z', '2026-11-12T11:30:00Z'), now)).toBeNull();
    expect(unblockOpensAt(undefined, now)).toBeNull();
  });
});
