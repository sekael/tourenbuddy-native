import { clearUserCache, getCached, putCached } from '@/core/offline/entity-cache';

import { fakeTables } from '../../support/fake-tables';

describe('entity cache', () => {
  beforeEach(() => fakeTables.reset());

  it('should resolve undefined for a key that was never written', async () => {
    expect(await getCached('tours:nobody')).toBeUndefined();
  });

  it('should keep Dates, Sets and Maps through the round trip', async () => {
    const day = new Date('2026-12-24T00:00:00.000Z');
    await putCached('friends:u1', { day, ids: new Set(['a']), names: new Map([['a', 'Anna']]) });
    const back = await getCached<{ day: Date; ids: Set<string>; names: Map<string, string> }>(
      'friends:u1',
    );
    expect(back?.day).toBeInstanceOf(Date);
    expect(back?.day.getTime()).toBe(day.getTime());
    expect(back?.ids.has('a')).toBe(true);
    expect(back?.names.get('a')).toBe('Anna');
  });

  it("should forget only the signed-out user's snapshots", async () => {
    await putCached('tours:u1', [1]);
    await putCached('tours:u2', [2]);
    await putCached('contacts:u1', [3]);
    await clearUserCache('u1');
    expect(await getCached('tours:u1')).toBeUndefined();
    expect(await getCached('contacts:u1')).toBeUndefined();
    expect(await getCached('tours:u2')).toEqual([2]);
  });
});
