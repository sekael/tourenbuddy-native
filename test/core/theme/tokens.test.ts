import { color } from '@/core/theme/tokens';

// WCAG 2.x relative luminance and contrast ratio for opaque #rrggbb colors.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('color tokens', () => {
  // Every text or icon role on the surface it is drawn on, including the less obvious pairs:
  // secondary text on the tinted map placeholder and on tonal controls.
  const pairs: [keyof typeof color, keyof typeof color][] = [
    ['onBackground', 'background'],
    ['onSurface', 'surface'],
    ['onSurfaceVariant', 'background'],
    ['onSurfaceVariant', 'surface'],
    ['onSurfaceVariant', 'surfaceVariant'],
    ['onSurface', 'neutralContainer'],
    ['onSecondaryContainer', 'secondaryContainer'],
    ['onSecondaryContainer', 'secondaryContainerPressed'],
    ['onFab', 'fab'],
    ['primary', 'background'],
  ];

  it.each(pairs)('should give %s on %s at least 4.5:1 (WCAG AA)', (fg, bg) => {
    expect(contrast(color[fg], color[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('should reject a pair that fails, so the check itself is sound', () => {
    expect(contrast('#94a3b8', color.background)).toBeLessThan(4.5); // the Vue outline grey
  });
});
