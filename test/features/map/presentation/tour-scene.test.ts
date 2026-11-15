import type { TFunction } from 'i18next';

import type { Tour } from '@/features/tours/domain/entities/tour';
import { chainLines, focusPoints } from '@/features/map/presentation/scene-shapes';
import { stagesOf, tourScene } from '@/features/map/presentation/tour-scene';
import { TOUR_TYPE_COLORS } from '@/features/tours/data/models/tour-type';
import { TOUR_FILL } from '../../../fixtures/tour-fill';

const tour = (over: Partial<Tour>): Tour =>
  ({
    ...TOUR_FILL,
    id: 'x',
    userId: 'me',
    name: 'T',
    goal: { lng: 7.9, lat: 46.56 },
    partnerIds: [],
    tourTypes: ['hiking'],
    completed: false,
    ...over,
  }) as Tour;

const outing = (id: string, position: number, over: Partial<Tour> = {}) =>
  tour({ id, outing: { id: 'o', name: 'Hubeli', position }, ...over });

// Three stages: 2 starts where 1 ends (a hand-over), 3 starts away from 2's end (a gap).
const s1 = outing('s1', 0, {
  goal: { lng: 7.89, lat: 46.56 },
  startPoint: { lng: 7.88, lat: 46.55 },
  startPointName: 'Gimmelwald',
  endPoint: { lng: 7.89, lat: 46.561 },
});
const s2 = outing('s2', 1, {
  goal: { lng: 7.86, lat: 46.55 },
  startPoint: { lng: 7.89, lat: 46.561 },
  endPoint: { lng: 7.9, lat: 46.54 },
  tourTypes: ['paragliding'],
});
const s3 = outing('s3', 2, {
  goal: { lng: 7.92, lat: 46.55 },
  startPoint: { lng: 7.95, lat: 46.6 },
  endPoint: { lng: 7.91, lat: 46.53 },
  endPointName: 'Matte',
});
const lone = tour({ id: 'lone', goal: { lng: 8.1, lat: 46.4 } });
const nearLone = tour({ id: 'near', goal: { lng: 8.1, lat: 46.4001 } }); // ~11 m away
const friend = tour({ id: 'f', userId: 'lena', isFriendTour: true, isPartner: false });

const base = { friends: [], selectedId: null, outing: null, listed: null };
const ids = (tours: Tour[]) => tours.map((t) => t.id);
const t = ((key: string) => key) as unknown as TFunction;

describe('tourScene', () => {
  it('should cluster only what a narrowed list keeps, an outing row keeping all its stages', () => {
    const scene = tourScene({
      ...base,
      owned: [s1, s2, s3, lone],
      listed: new Set(['s1', 's2', 's3']),
    });
    expect(ids(scene.clustered)).toEqual(['s1', 's2', 's3']);
  });

  it('should show nothing but the open tour, unclustered, and drop the chains', () => {
    const scene = tourScene({ ...base, owned: [s1, s2, s3, lone], selectedId: 's2' });
    expect(ids(scene.focus)).toEqual(['s2']);
    expect(scene.clustered).toEqual([]);
    expect(scene.chains).toEqual([]);
    expect(scene.segmentIds).toEqual([]);
  });

  it('should show a friend tour opened from the list though it has no marker of its own', () => {
    const scene = tourScene({ ...base, owned: [lone], friends: [friend], selectedId: 'f' });
    expect(ids(scene.mapTours)).toEqual(['lone']);
    expect(ids(scene.focus)).toEqual(['f']);
  });

  it('should number the open outing in its order, whatever order the tours come in', () => {
    const scene = tourScene({ ...base, owned: [s3, lone, s1, s2], outing: 'me/o' });
    expect(scene.segmentIds).toEqual(['s1', 's2', 's3']);
    expect(scene.clustered).toEqual([]);
  });

  it('should chain a closed outing in stage order and none of a lone tour', () => {
    const scene = tourScene({ ...base, owned: [s3, lone, s1, s2] });
    expect(scene.chains).toEqual([
      [
        [7.89, 46.56],
        [7.86, 46.55],
        [7.92, 46.55],
      ],
    ]);
    expect(chainLines(scene.chains)).toHaveLength(2);
  });

  it('should not chain an outing the list thins to a single stage', () => {
    const scene = tourScene({ ...base, owned: [s1, s2, s3], listed: new Set(['s1']) });
    expect(scene.chains).toEqual([]);
  });

  it('should offer the other tours on the open tour spot, the open one first', () => {
    const scene = tourScene({ ...base, owned: [lone, nearLone, s1], selectedId: 'near' });
    expect(scene.spot?.ids).toEqual(['near', 'lone']);
  });

  it('should offer no spot list when only tours the list hides share the spot', () => {
    const scene = tourScene({
      ...base,
      owned: [lone, nearLone],
      selectedId: 'near',
      listed: new Set(['near']),
    });
    expect(scene.spot).toBeNull();
  });
});

describe('stagesOf', () => {
  it('should number stages within their own outing only', () => {
    const stages = stagesOf([s2, lone, s1]);
    expect(stages.get('s1')).toEqual({ n: 1, total: 2 });
    expect(stages.get('s2')).toEqual({ n: 2, total: 2 });
    expect(stages.has('lone')).toBe(false);
  });
});

describe('focusPoints', () => {
  it('should mark the outing start, a hand-over in the next stage colour, both gap sides and the end', () => {
    const scene = tourScene({ ...base, owned: [s1, s2, s3], outing: 'me/o' });
    const points = focusPoints(scene, t).features.map((f) => f.properties);
    expect(points).toEqual([
      { kind: 'start', label: 'Gimmelwald' },
      { kind: 'via', color: TOUR_TYPE_COLORS.paragliding },
      { kind: 'end', label: 'tours.form.endPointLabel' },
      { kind: 'start', label: 'tours.form.startPointLabel' },
      { kind: 'end', label: 'Matte' },
    ]);
  });

  it('should put the "+N" chip on the open tour spot with every tour there', () => {
    const scene = tourScene({ ...base, owned: [lone, nearLone], selectedId: 'lone' });
    const more = focusPoints(scene, t).features.find((f) => f.properties.kind === 'more');
    expect(more?.properties).toEqual({ kind: 'more', image: 'more|1', ids: 'lone,near' });
  });
});
