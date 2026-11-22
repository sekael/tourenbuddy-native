import { termsGate } from '@/features/terms/domain/terms';

describe('termsGate', () => {
  it.each([
    ['an app older than the version in force', '2026-11-22', '2027-03-01', '2027-03-01', 'update'],
    ['an older app that never accepted', '2026-11-22', '2027-03-01', null, 'update'],
    [
      'a newer app on the accepted version in force',
      '2027-03-01',
      '2026-11-22',
      '2026-11-22',
      'pass',
    ],
    [
      'a newer app, version in force never accepted',
      '2027-03-01',
      '2026-11-22',
      null,
      'unavailable',
    ],
    [
      'a newer app, an even older version accepted',
      '2027-03-01',
      '2026-11-22',
      '2026-01-01',
      'unavailable',
    ],
    ['a first acceptance', '2026-11-22', '2026-11-22', null, 'accept'],
    [
      'changed terms after an earlier acceptance',
      '2027-03-01',
      '2027-03-01',
      '2026-11-22',
      'changed',
    ],
  ])('should answer %s', (_, bundled, current, accepted, gate) => {
    expect(termsGate(bundled, { current, accepted })).toBe(gate);
  });
});
