import type { Tour } from '@/features/tours/domain/entities/tour';
import { listEntries } from '@/features/tours/presentation/stores/tour-filters-store';

const tour = (id: string, outing?: { id: string; position: number }) =>
  ({ id, userId: 'me', outing: outing ?? null }) as unknown as Tour;

describe('listEntries', () => {
  it('should count an outing as one row, as the filters’ "Show N tours" does', () => {
    const tours = [
      tour('hubeli', { id: 'o1', position: 0 }),
      tour('chrinna', { id: 'o1', position: 1 }),
      tour('schwarzmoench', { id: 'o1', position: 2 }),
      tour('cafe'),
    ];
    expect(listEntries(tours, tours)).toHaveLength(2);
  });

  it('should list an outing whose other stages are filtered out with all its stages', () => {
    const tours = [tour('a', { id: 'o1', position: 0 }), tour('b', { id: 'o1', position: 1 })];
    const [entry] = listEntries([tours[1]!], tours);
    expect(entry).toMatchObject({ kind: 'outing' });
    expect(entry!.kind === 'outing' && entry!.segments.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
