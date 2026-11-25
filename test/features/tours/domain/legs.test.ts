import {
  choicesOf,
  chosenDirection,
  chosenLegs,
  defaultDirection,
  directionOf,
  flight,
  flownWhole,
  landsByAir,
  legsApart,
  legsFrom,
  legsMatch,
  routeOrder,
  sumFlight,
  wayAllowed,
  waysCovered,
} from '@/features/tours/domain/legs';

describe('defaultDirection', () => {
  it('should fly down and walk up once paragliding comes with something else', () => {
    expect(defaultDirection('paragliding', ['paragliding', 'climbing'])).toBe('down');
    expect(defaultDirection('climbing', ['paragliding', 'climbing'])).toBe('up');
  });

  it('should carry the bike up and ride it down on a hike & bike, unless a glider flies down', () => {
    expect(defaultDirection('mountain-biking', ['hiking', 'mountain-biking'])).toBe('down');
    expect(defaultDirection('hiking', ['hiking', 'mountain-biking'])).toBe('up');
    expect(defaultDirection('mountain-biking', ['paragliding', 'hiking', 'mountain-biking'])).toBe(
      'up',
    );
  });

  it('should keep paragliding alone, and other pairs, both ways', () => {
    expect(defaultDirection('paragliding', ['paragliding'])).toBe('both');
    expect(defaultDirection('mountain-biking', ['mountain-biking', 'climbing'])).toBe('both');
  });
});

describe('waysCovered', () => {
  it('should fail once a way has no activity left', () => {
    expect(waysCovered(['hiking', 'mountain-biking'], () => 'up')).toBe(false);
    expect(
      waysCovered(['hiking', 'mountain-biking'], (t) => (t === 'hiking' ? 'up' : 'both')),
    ).toBe(true);
  });
});

describe('legsFrom', () => {
  it('should not split when every activity goes both ways', () => {
    expect(legsFrom(['hiking', 'mountain-biking'], () => 'both')).toBeNull();
  });

  it('should not split when one leg would be empty', () => {
    expect(legsFrom(['paragliding', 'hiking'], () => 'down')).toBeNull();
  });

  it('should let an activity run on both legs of a split tour', () => {
    const way = { skitour: 'both', paragliding: 'down' } as const;
    expect(legsFrom(['skitour', 'paragliding'], (t) => way[t as keyof typeof way])).toEqual({
      ascent: ['skitour'],
      descent: ['skitour', 'paragliding'],
    });
  });
});

describe('directionOf', () => {
  it('should call an activity the legs do not name both ways', () => {
    expect(directionOf({ ascent: ['hiking'], descent: ['paragliding'] }, 'mountain-biking')).toBe(
      'both',
    );
  });
});

describe('legsMatch', () => {
  it('should fail once an activity joins or leaves', () => {
    const legs = { ascent: ['hiking'], descent: ['paragliding'] } as const;
    expect(
      legsMatch(['paragliding', 'hiking'], {
        ascent: [...legs.ascent],
        descent: [...legs.descent],
      }),
    ).toBe(true);
    expect(legsMatch(['hiking'], { ascent: [...legs.ascent], descent: [...legs.descent] })).toBe(
      false,
    );
  });
});

describe('routeOrder / landsByAir', () => {
  it('should lead with the way up although paragliding sorts first', () => {
    expect(
      routeOrder({
        tourTypes: ['paragliding', 'hiking'],
        legs: { ascent: ['hiking'], descent: ['paragliding'] },
      }),
    ).toEqual(['hiking', 'paragliding']);
  });

  it('should land whenever the way down ends in a flight', () => {
    expect(
      landsByAir({
        tourTypes: ['paragliding', 'skitour'],
        legs: { ascent: ['skitour'], descent: ['skitour', 'paragliding'] },
      }),
    ).toBe(true);
    expect(landsByAir({ tourTypes: ['paragliding'] })).toBe(true);
    expect(landsByAir({ tourTypes: ['hiking'] })).toBe(false);
  });

  it("should list a flown way's activities glider last, and never fly an unsplit tour's way up", () => {
    expect(
      flight({
        tourTypes: ['paragliding', 'skitour'],
        legs: { ascent: ['skitour'], descent: ['paragliding', 'skitour'] },
      }),
    ).toEqual({ up: null, down: ['skitour', 'paragliding'] });
    expect(
      flight({
        tourTypes: ['paragliding', 'hiking'],
        legs: { ascent: ['paragliding'], descent: ['hiking'] },
      }),
    ).toEqual({ up: ['paragliding'], down: null });
    expect(flight({ tourTypes: ['paragliding'] })).toEqual({ up: null, down: ['paragliding'] });
  });
});

describe('sumFlight', () => {
  const hut = { tour: { tourTypes: ['hiking' as const] }, ascent: 1495, descent: 0 };

  it("should call an outing's descent flown when only its flown stage descends", () => {
    const summitAndFly = {
      tour: {
        tourTypes: ['paragliding' as const, 'hiking' as const],
        legs: { ascent: ['hiking' as const], descent: ['paragliding' as const] },
      },
      ascent: 826,
      descent: 2954,
    };
    expect(sumFlight([hut, summitAndFly])).toEqual({ up: null, down: ['paragliding'] });
  });

  it('should share the climb with the glider once a stage climbs in thermals', () => {
    const thermals = {
      tour: {
        tourTypes: ['paragliding' as const],
        legs: { ascent: ['paragliding' as const], descent: ['paragliding' as const] },
      },
      ascent: 794,
      descent: 842,
    };
    expect(sumFlight([hut, thermals]).up).toEqual(['hiking', 'paragliding']);
  });
});

describe('legsApart', () => {
  it('should read a glider flown the whole way as one activity', () => {
    expect(legsApart({ ascent: ['paragliding'], descent: ['paragliding'] })).toBeNull();
    expect(legsApart({ ascent: ['hiking'], descent: ['paragliding'] })).not.toBeNull();
  });
});

describe('picked ways (the form, as the PWA)', () => {
  it('should keep a picked way when another activity comes, the newcomer taking its default', () => {
    const picks = { hiking: 'both', paragliding: 'down' } as const;
    const types = ['paragliding', 'hiking', 'mountain-biking'] as const;
    expect(chosenDirection(types, picks, 'hiking')).toBe('both');
    // A glider in the mix: the bike is no longer the way down by default.
    expect(chosenDirection(types, picks, 'mountain-biking')).toBe('up');
  });

  it('should show and save the defaults when the picks leave a way without an activity', () => {
    // Hiking was the only way up; with the glider gone too, the bike alone is left to go down.
    const picks = { hiking: 'down', 'mountain-biking': 'down' } as const;
    const types = ['hiking', 'mountain-biking'] as const;
    expect(chosenDirection(types, picks, 'hiking')).toBe('up');
    expect(chosenLegs(types, picks)).toEqual({ ascent: ['hiking'], descent: ['mountain-biking'] });
  });

  it('should grey the way that would take the last activity out of a way', () => {
    const types = ['mountaineering', 'paragliding'] as const;
    expect(wayAllowed(types, {}, 'paragliding', 'up')).toBe(false);
    expect(wayAllowed(types, {}, 'paragliding', 'both')).toBe(true);
    expect(wayAllowed(types, {}, 'mountaineering', 'down')).toBe(false);
  });

  it('should fly a lone glider down unless picked to fly the whole way, never only up', () => {
    expect(chosenDirection(['paragliding'], {}, 'paragliding')).toBe('down');
    expect(chosenLegs(['paragliding'], {})).toBeNull();
    expect(chosenLegs(['paragliding'], { paragliding: 'both' })).toEqual({
      ascent: ['paragliding'],
      descent: ['paragliding'],
    });
    expect(wayAllowed(['paragliding'], {}, 'paragliding', 'up')).toBe(false);
  });

  it('should leave nothing split when every activity goes both ways', () => {
    expect(chosenLegs(['hiking', 'trailrunning'], {})).toBeNull();
    expect(chosenLegs(['hiking'], { hiking: 'up' })).toBeNull();
  });

  it('should read an unsplit tour as both ways, so editing keeps it unsplit', () => {
    expect(choicesOf({ tourTypes: ['hiking', 'paragliding'], legs: null })).toEqual({
      hiking: 'both',
      paragliding: 'both',
    });
    expect(choicesOf({ tourTypes: ['paragliding'], legs: null })).toEqual({ paragliding: 'down' });
    expect(
      choicesOf({
        tourTypes: ['paragliding'],
        legs: { ascent: ['paragliding'], descent: ['paragliding'] },
      }),
    ).toEqual({ paragliding: 'both' });
    expect(choicesOf({ tourTypes: [], legs: null })).toEqual({});
  });
});

describe('flownWhole', () => {
  it('should fly a way whole only on the glider alone', () => {
    const tourTypes = ['paragliding', 'hiking', 'skitour'] as const;
    expect(
      flownWhole({ tourTypes, legs: { ascent: ['hiking'], descent: ['paragliding'] } }),
    ).toEqual({ up: false, down: true });
    // Skiing down to a lower launch first: the flight can't be told from the run.
    expect(
      flownWhole({
        tourTypes,
        legs: { ascent: ['skitour'], descent: ['paragliding', 'skitour'] },
      }),
    ).toEqual({ up: false, down: false });
  });

  it("should fly a lone glider's way down but not an unsplit hike & fly, and never its way up", () => {
    expect(flownWhole({ tourTypes: ['paragliding'] })).toEqual({ up: false, down: true });
    expect(flownWhole({ tourTypes: ['paragliding', 'hiking'] })).toEqual({
      up: false,
      down: false,
    });
  });
});
