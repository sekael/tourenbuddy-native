import { breakpointFor } from '@/core/theme/use-breakpoint';

describe('breakpointFor', () => {
  it.each([
    [0, 'compact'],
    [599, 'compact'],
    [599.5, 'compact'],
    [600, 'medium'],
    [1023, 'medium'],
    [1024, 'expanded'],
    [2560, 'expanded'],
  ])('should map a %s dp window to %s', (width, expected) => {
    expect(breakpointFor(width)).toBe(expected);
  });
});
