import type { TFunction } from 'i18next';

import { followStatus } from '@/features/map/presentation/follow-section';

const t = ((key: string, values?: object) =>
  values ? `${key} ${JSON.stringify(values)}` : key) as unknown as TFunction;

describe('followStatus', () => {
  it('should name each way where they follow differently', () => {
    expect(followStatus(t, { following: true, up: 'hiking', down: 'straight' })).toBe(
      'map.plan.follow.perWay {"up":"map.plan.follow.option.hiking","down":"map.plan.follow.option.flown"}',
    );
  });

  it('should name one network for a route without a way down, and a flight as flown', () => {
    expect(followStatus(t, { following: true, up: 'ski', down: null })).toBe('map.plan.follow.ski');
    expect(followStatus(t, { following: true, up: 'straight', down: 'straight' })).toBe(
      'map.plan.follow.flown',
    );
  });

  it('should say straight when switched off, and a leg that went straight before the ways', () => {
    expect(followStatus(t, { following: false, up: 'straight', down: 'straight' })).toBe(
      'map.plan.follow.straight',
    );
    expect(
      followStatus(t, { following: true, up: 'hiking', down: 'straight', unavailable: true }),
    ).toBe('map.plan.follow.unavailable');
  });
});
