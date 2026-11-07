import { icons } from '@/core/adaptive/icons';

describe('icon registry', () => {
  it.each(Object.entries(icons))('should give %s an SF Symbol and a drawable path', (_, icon) => {
    expect(icon.sf).toMatch(/^[a-z0-9]+(\.[a-z0-9]+)*$/);
    // A path pasted with its markup (`<path d="…"/>`) or a stray quote would draw nothing.
    expect(icon.md).toMatch(/^[Mm][MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
  });
});
