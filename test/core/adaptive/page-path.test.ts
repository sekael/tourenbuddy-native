import { opened } from '@/core/adaptive/page-path';

describe('opened', () => {
  it('should push a page that is not open', () => {
    expect(opened(['tour:a'], 'outing:x')).toEqual(['tour:a', 'outing:x']);
  });

  it('should go back to a page already open instead of showing it twice', () => {
    expect(opened(['outing:x', 'tour:b'], 'outing:x')).toEqual(['outing:x']);
    expect(opened(['tour:a', 'outing:x', 'tour:b'], 'tour:b')).toEqual([
      'tour:a',
      'outing:x',
      'tour:b',
    ]);
  });
});
