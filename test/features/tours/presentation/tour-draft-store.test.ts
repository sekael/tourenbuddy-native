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

describe('tour draft: the activity follows the line', () => {
  it('should make a guessed hike a ski tour once the line follows the ski routes', () => {
    store().begin('create', null, { tourTypes: ['hiking'] });
    store().followed('ski');
    expect(store().draft.tourTypes).toEqual(['skitour']);
    store().followed('hiking');
    expect(store().draft.tourTypes).toEqual(['hiking']);
  });

  it('should leave an activity the user picked', () => {
    store().begin('create', null, { tourTypes: [] });
    store().update({ tourTypes: ['trailrunning'] });
    store().followed('ski');
    expect(store().draft.tourTypes).toEqual(['trailrunning']);
  });

  it('should change nothing for a straight line', () => {
    store().begin('create', null, { tourTypes: ['skitour'] });
    store().followed('straight');
    expect(store().draft.tourTypes).toEqual(['skitour']);
  });
});
