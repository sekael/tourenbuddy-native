import { skiDifficultyGrade } from '@/features/map/domain/ski-difficulty';

describe('skiDifficultyGrade', () => {
  it('should order modifiers within a grade and across grades', () => {
    const order = ['L-', 'L', 'L+', 'WS-', 'WS', 'ZS+', 'S-', 'SS', 'AS', 'EX+'].map(
      skiDifficultyGrade,
    );
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
    expect(new Set(order).size).toBe(order.length);
  });

  it('should span the full scale up to EX+', () => {
    expect(skiDifficultyGrade('L-')).toBe(0);
    expect(skiDifficultyGrade('SS')).toBe(13);
    expect(skiDifficultyGrade('EX+')).toBe(20);
  });

  it('should grade the French letters (en/fr/it fields) like their German twins', () => {
    const pairs = [
      ['L-', 'F-'],
      ['WS+', 'PD+'],
      ['ZS', 'AD'],
      ['S-', 'D-'],
      ['SS', 'TD'],
      ['AS+', 'ED+'],
    ];
    for (const [de, fr] of pairs) expect(skiDifficultyGrade(fr!)).toBe(skiDifficultyGrade(de!));
  });

  // scripts/ski-routes/build.ts grades the published dataset with this function: these are the
  // grades the Vue module gave, so a change here re-grades every route on the next data build.
  it.each([
    ['German', ['L', 'WS', 'ZS', 'S', 'SS', 'AS', 'EX']],
    ['alpine', ['F', 'PD', 'AD', 'D', 'TD', 'ED', 'EX']],
  ])('should keep the dataset grades 0–20 for every %s letter and modifier', (_, letters) => {
    const all = letters.flatMap((letter) => [`${letter}-`, letter, `${letter}+`]);
    expect(all.map(skiDifficultyGrade)).toEqual([...Array(21).keys()]);
  });

  it('should tolerate case and whitespace', () => {
    expect(skiDifficultyGrade(' zs+ ')).toBe(skiDifficultyGrade('ZS+'));
  });

  it.each([null, '', 'T4', 'WS++', 'W S', 'ZS/S'])('should return null for %j', (value) => {
    expect(skiDifficultyGrade(value)).toBeNull();
  });
});
