import { useTourDraftStore } from '@/features/tours/presentation/stores/tour-draft-store';

jest.mock('@/features/tours/data/services/swisstopo-name-service', () => ({
  suggestTourName: jest.fn(async () => 'Bletscha'),
}));
jest.mock('@/features/tours/data/services/swisstopo-elevation-service', () => ({
  getElevation: jest.fn(async () => 1045),
}));

const store = () => useTourDraftStore.getState();
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('tour draft: one start and one end', () => {
  beforeEach(() => {
    store().begin('create');
    store().update({
      startPoint: { lng: 7.9, lat: 46.59 },
      startPointName: 'Wytimatte',
      startPointElevation: 785,
      endPoint: { lng: 7.91, lat: 46.6 },
      endPointName: 'Old end',
      endPointElevation: 900,
    });
  });

  it('should move the end to where the track ends, named and measured anew', async () => {
    store().setEnds([7.9, 46.59], [7.95, 46.62]);
    expect(store().draft.endPoint).toEqual({ lng: 7.95, lat: 46.62 });
    expect(store().draft.endPointName).toBeNull();
    await settle();
    expect(store().draft.endPointName).toBe('Bletscha');
    expect(store().draft.endPointElevation).toBe(1045);
  });

  it('should keep the name of a start that stayed put', () => {
    store().setEnds([7.90001, 46.59001], [7.95, 46.62]);
    expect(store().draft.startPointName).toBe('Wytimatte');
    expect(store().draft.startPoint).toEqual({ lng: 7.9, lat: 46.59 });
  });

  it('should drop the end when the track ends at the goal', () => {
    store().setEnds([7.9, 46.59], null);
    expect(store().draft.endPoint).toBeNull();
    expect(store().draft.endPointName).toBeNull();
  });

  it('should not name a point the user moved again before the lookup came back', async () => {
    store().setEnds([7.9, 46.59], [7.95, 46.62]);
    store().update({ endPoint: { lng: 8, lat: 46.7 }, endPointName: 'Mine' });
    await settle();
    expect(store().draft.endPointName).toBe('Mine');
  });
});

describe('tour draft: ways up and down', () => {
  it('should fly a glider down once it joins a hike, and keep a picked way as activities change', () => {
    store().begin('create');
    store().toggleType('hiking');
    store().toggleType('paragliding');
    expect(store().draft.legs).toEqual({ ascent: ['hiking'], descent: ['paragliding'] });

    // Flown from the start in thermals; a bike added later keeps the glider both ways.
    store().setWay('paragliding', 'both');
    store().toggleType('mountain-biking');
    expect(store().draft.legs).toEqual({
      ascent: ['paragliding', 'hiking', 'mountain-biking'],
      descent: ['paragliding'],
    });
  });

  it('should keep an unsplit tour unsplit when editing adds an activity', () => {
    const tour = {
      id: 't1',
      tourTypes: ['hiking', 'trailrunning'],
      legs: null,
      goal: { lng: 7.9, lat: 46.6 },
    } as never;
    store().begin('edit', tour);
    store().toggleType('paragliding');
    // The two already there go both ways as saved; only the newcomer takes its default, down.
    expect(store().draft.legs).toEqual({
      ascent: ['hiking', 'trailrunning'],
      descent: ['paragliding', 'hiking', 'trailrunning'],
    });
  });
});
