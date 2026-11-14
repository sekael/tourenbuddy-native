import { Platform } from 'react-native';

/**
 * Design tokens, mapped from the Vue app's `tokens.css` (D12: brand-seeded static scheme, light
 * only). Two tiers: `palette` holds raw values and is read only by this file; components use the
 * semantic `color` roles, so a later dark scheme reassigns roles, not components.
 */
const palette = {
  white: '#ffffff',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate600: '#475569',
  slate900: '#0f172a',
  blue50: '#eff6ff',
  blue100: '#dbeafe',
  blue200: '#bfdbfe',
  blue600: '#2563eb',
  blue700: '#1d4ed8',
  blue900: '#1e3a8a',
  red600: '#dc2626',
  swisstopoRed: '#e3061b',
  green800: '#166534',
  orange500: '#f97316',
} as const;

const IOS = Platform.OS === 'ios';

export const color = {
  primary: palette.blue600,
  // Tonal controls: one step stronger than surfaceVariant, so they stand off white and tinted fills.
  secondaryContainer: palette.blue100,
  secondaryContainerPressed: palette.blue200,
  onSecondaryContainer: palette.blue900,
  // Floating controls over the map (Android and web): brand blue with white glyphs.
  fab: palette.blue700,
  onFab: palette.white,
  /** A picked ski route on the map: orange, since swisstopo draws the routes themselves blue. */
  trailHighlight: palette.orange500,
  /** The blue capsule as frosted glass (iOS): blue enough for white glyphs over snow (3:1). */
  fabGlass: 'rgba(29, 78, 216, 0.7)',
  /** Lifts white glyphs off clear glass over bright snow and glacier. */
  onGlassShadow: 'rgba(15, 23, 42, 0.55)',
  /** The half of the blue glass capsule under the finger, lit as a system glass item is. */
  onGlassPressed: 'rgba(255, 255, 255, 0.24)',
  /** A line between actions on the blue capsule. */
  onFabDivider: 'rgba(255, 255, 255, 0.45)',
  /** An area marked on the map (an offline region): the app's blue, faint enough to read through. */
  areaFill: 'rgba(37, 99, 235, 0.12)',
  /** Clear glass over the map, breathed with the app's blue (iOS round map controls). */
  glassTint: 'rgba(37, 99, 235, 0.12)',
  background: palette.white,
  // iOS text in the system's label colours, as the SwiftUI lists beside it (light only for now).
  onBackground: IOS ? '#000000' : palette.slate900,
  surface: palette.slate50,
  onSurface: IOS ? '#000000' : palette.slate900,
  surfaceVariant: palette.blue50,
  // The system's secondary grey at its higher-contrast step, to keep 4.5:1 on every surface.
  onSurfaceVariant: IOS ? '#6C6C70' : palette.slate600,
  neutralContainer: palette.slate100,
  divider: palette.slate200,
  /** Borders of text fields, days outside the month (iOS: the system separator grey). */
  outlineVariant: IOS ? '#C6C6C8' : palette.slate300,
  error: palette.red600,
  success: palette.green800,
  /** A terrain profile's line, as the swisstopo app draws it under a tour. */
  elevation: palette.swisstopoRed,
  elevationFill: 'rgba(227, 6, 27, 0.12)',
  /** Text over photos, under `scrim`. */
  onContrast: palette.white,
  backdrop: 'rgba(15, 23, 42, 0.35)',
  /** Darkens a photo from top to bottom so text over it stays legible. */
  scrim: 'linear-gradient(rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.6))',
} as const;

/** 4-point scale. */
export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 10, md: 20, lg: 28, pill: 9999 } as const;

/**
 * iOS uses the system font (D11), so `fontFamily` stays unset there. Android embeds Inter at build
 * time; web loads it at startup and falls back to the system stack until it arrives.
 */
const fontFamily = Platform.select({
  android: 'Inter',
  web: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
});

/**
 * Headings use medium (500), not bold, as in the Vue app; on iOS semibold and the system font's own
 * tracking (it tightens large sizes itself), so they read as the SwiftUI headings beside them.
 */
export const type = {
  /** The product name over the sign-in photo. */
  display: {
    fontFamily,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: IOS ? '700' : '600',
    letterSpacing: IOS ? 0 : -1.2,
  },
  title: {
    fontFamily,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: IOS ? '600' : '500',
    letterSpacing: IOS ? 0 : -0.5,
  },
  body: { fontFamily, fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontFamily, fontSize: 16, lineHeight: 20, fontWeight: '500' },
  caption: { fontFamily, fontSize: 14, lineHeight: 20, fontWeight: '400' },
} as const;

/** Emphasis within running text: an email address, the active tab's label. */
export const strong = { fontWeight: '600' } as const;

/** Text in fields. No line height: on iOS it pushes a single-line field's text off centre. */
export const fieldType = {
  body: { fontFamily, fontSize: type.body.fontSize },
  /** The sign-in code: large digits, spaced apart. */
  code: { fontFamily, fontSize: 24, letterSpacing: space.xs },
} as const;

/** Lifts text off a photo, together with `color.scrim`. */
export const textShadow = {
  textShadowColor: 'rgba(0, 0, 0, 0.4)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 8,
} as const;

export const size = {
  icon: 24,
  /** Minimum touch target (Apple 44 pt, Material 48 dp). */
  touch: 48,
  fab: 56,
  /** A floating control over the map (glass on iOS): compact, still a full touch target. */
  mapControl: 44,
  /** Widest a form or an account card gets on a tablet or a desktop window. */
  form: 400,
  /** Outline of a text field. */
  fieldBorder: 1.5,
  /** The web's side panel beside the map. */
  panel: 420,
} as const;

/** Material's opacity for disabled controls. */
export const opacity = { disabled: 0.38 } as const;

/** Calm and unhurried. Durations in ms; Material and web use them, iOS animates natively. */
export const motion = {
  short: 200,
  medium: 320,
  /** Delay between menu items unfolding one after another. */
  stagger: 40,
  /** Travel for anything gliding in. */
  offset: 12,
  pressScale: 0.97,
} as const;

export const shadow = {
  /** Under a glyph on clear glass (text shadow, iOS layer shadow). */
  glyph: { offset: { width: 0, height: 1 }, radius: 3 },
  md: '0 2px 4px rgba(23, 37, 84, 0.04), 0 8px 20px -4px rgba(23, 37, 84, 0.14)',
  lg: '0 4px 8px rgba(23, 37, 84, 0.04), 0 16px 40px -8px rgba(23, 37, 84, 0.22)',
} as const;

/** Window widths (dp) where the layout changes: phone below `medium`, desktop from `expanded`. */
export const breakpoint = { medium: 600, expanded: 1024 } as const;
