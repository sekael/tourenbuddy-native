import { initialFollow, snapNetworkFor, wayFollow } from '@/features/map/domain/snap-network';

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

describe('wayFollow', () => {
  const hikeAndFly = {
    tourTypes: ['hiking', 'paragliding'] as const,
    legs: { ascent: ['hiking' as const], descent: ['paragliding' as const] },
  };

  it('should walk up the trails and fly the way down straight on a hike & fly', () => {
    expect(wayFollow([], hikeAndFly, 'up')).toBe('hiking');
    expect(wayFollow([], hikeAndFly, 'down')).toBe('straight');
  });

  it('should follow the ski routes on a way that skis before it flies', () => {
    const skiFly = {
      tourTypes: ['skitour', 'paragliding'] as const,
      legs: { ascent: ['skitour' as const], descent: ['skitour' as const, 'paragliding' as const] },
    };
    expect(wayFollow(['hiking'], skiFly, 'up')).toBe('ski');
    // Flown only in part: the run to the launch is on the ski routes.
    expect(wayFollow(['hiking'], skiFly, 'down')).toBe('ski');
  });

  it('should walk a lone glider up to the launch and fly it down', () => {
    const glider = { tourTypes: ['paragliding'] as const, legs: null };
    expect(wayFollow([], glider, 'up')).toBe('hiking');
    expect(wayFollow([], glider, 'down')).toBe('straight');
  });

  it('should fly both ways straight from the valley in thermals', () => {
    const thermal = {
      tourTypes: ['paragliding'] as const,
      legs: { ascent: ['paragliding' as const], descent: ['paragliding' as const] },
    };
    expect(wayFollow([], thermal, 'up')).toBe('straight');
    expect(wayFollow([], thermal, 'down')).toBe('straight');
  });
});
