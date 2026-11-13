import { initialFollow, snapNetworkFor } from '@/features/map/domain/snap-network';

describe('snapNetworkFor', () => {
  it('should draw straight with no trail layer shown, whatever the activity', () => {
    expect(snapNetworkFor([], ['skitour'])).toBeNull();
  });

  it('should follow the one layer shown even against the activity', () => {
    expect(snapNetworkFor(['ski'], ['hiking'])).toBe('ski');
    expect(snapNetworkFor(['hiking'], ['skitour'])).toBe('hiking');
  });

  it('should let hiking win with both layers when hiking and ski touring are both picked, or neither', () => {
    expect(snapNetworkFor(['hiking', 'ski'], ['skitour', 'hiking'])).toBe('hiking');
    expect(snapNetworkFor(['hiking', 'ski'], [])).toBe('hiking');
    expect(snapNetworkFor(['hiking', 'ski'], ['splitboarding', 'mountaineering'])).toBe('ski');
  });
});

describe('initialFollow', () => {
  it('should follow the ski routes for an activity on skis, even with only hiking trails shown', () => {
    expect(initialFollow(['hiking'], ['skitour'])).toBe('ski');
  });

  it('should follow the hiking trails for any other activity, even with only ski routes shown', () => {
    expect(initialFollow(['ski'], ['hiking'])).toBe('hiking');
  });

  it('should go by the map without an activity, hiking when it shows no trails', () => {
    expect(initialFollow(['ski'], [])).toBe('ski');
    expect(initialFollow([], [])).toBe('hiking');
  });
});
