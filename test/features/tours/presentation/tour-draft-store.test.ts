import {
  firstUnsavableDay,
  useTourDraftStore,
} from '@/features/tours/presentation/stores/tour-draft-store';

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

describe('tour draft: days laid out before the first save', () => {
  const day1 = () => {
    store().begin('create', null, {
      name: 'Cabane des Dix',
      plannedDate: new Date(Date.UTC(2027, 2, 12)),
      tourTypes: ['hiking'],
      partnerIds: ['a'],
    });
    useTourDraftStore.setState({ goal: { lng: 7.4, lat: 46.0 } });
    store().update({ endPoint: { lng: 7.41, lat: 46.01 }, endPointName: 'Hütte' });
  };

  it('should start the next day where the last ends, the day after, and show it', () => {
    day1();
    store().nextDay();
    expect(store().stages).toHaveLength(2);
    expect(store().active).toBe(1);
    expect(store().goal).toBeNull();
    expect(store().draft).toMatchObject({
      startPoint: { lng: 7.41, lat: 46.01 },
      startPointName: 'Hütte',
      plannedDate: new Date(Date.UTC(2027, 2, 13)),
      tourTypes: ['hiking'],
      partnerIds: ['a'],
    });
  });

  it('should not lay out a next day before the last has its goal', () => {
    store().begin('create');
    store().nextDay();
    expect(store().stages).toEqual([]);
  });

  it('should keep each day as it was left when switching between them', () => {
    day1();
    store().nextDay();
    store().update({ name: 'Day two' });
    store().selectDay(0);
    expect(store().draft.name).toBe('Cabane des Dix');
    store().selectDay(1);
    expect(store().draft.name).toBe('Day two');
    expect(
      store()
        .days()
        .map((d) => d.draft.name),
    ).toEqual(['Cabane des Dix', 'Day two']);
  });

  it('should carry a partner added on day 1 to the later days that shared them', () => {
    day1();
    store().nextDay();
    store().selectDay(0);
    store().update({ partnerIds: ['a', 'b'] });
    store().toggleType('paragliding');
    const [, two] = store().days();
    expect(two!.draft.partnerIds).toEqual(['a', 'b']);
    expect(two!.draft.tourTypes).toEqual(store().draft.tourTypes);
    expect(two!.draft.legs).not.toBeNull();
  });

  it('should move the later days along when day 1 moves', () => {
    day1();
    store().nextDay();
    store().selectDay(0);
    store().update({ plannedDate: new Date(Date.UTC(2027, 2, 20)) });
    expect(store().days()[1]!.draft.plannedDate).toEqual(new Date(Date.UTC(2027, 2, 21)));
  });

  it('should drop a later day and show the one before; one day left is one tour again', () => {
    day1();
    store().nextDay();
    store().removeDay(1);
    expect(store().stages).toEqual([]);
    expect(store().active).toBe(0);
    expect(store().draft.name).toBe('Cabane des Dix');
    store().removeDay(0);
    expect(store().draft.name).toBe('Cabane des Dix');
  });

  it('should name a start the day before left unnamed', async () => {
    day1();
    store().update({ endPoint: null, endPointName: null });
    useTourDraftStore.setState({
      route: { points: { start: null, goal: null, end: null }, track: null } as never,
    });
    store().update({ name: '' });
    store().nextDay();
    expect(store().draft.startPoint).toEqual({ lng: 7.4, lat: 46.0 });
    await settle();
    expect(store().draft.startPointName).toBe('Bletscha');
  });

  it('should point a save at the first day without a name or goal', () => {
    day1();
    store().nextDay();
    expect(firstUnsavableDay(store().days())).toBe(1);
    useTourDraftStore.setState({ goal: { lng: 7.5, lat: 46.1 } });
    expect(firstUnsavableDay(store().days())).toBe(1);
    store().update({ name: 'Day two' });
    expect(firstUnsavableDay(store().days())).toBe(-1);
    store().selectDay(0);
    store().update({ name: '  ' });
    expect(firstUnsavableDay(store().days())).toBe(0);
  });
});
