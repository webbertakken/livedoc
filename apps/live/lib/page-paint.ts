// What a page is painted with (docs/specs/007-editor/pages-mode.md
// "Backgrounds"): the panel's preset catalogue. The CSS a sheet takes from its background is
// page-sheet-style's; the export paints the same background onto its own canvas (export-page).
import {
  DUSK_BOTTOM_SHADE,
  DUSK_TOP_SHADE,
  STEEL_GRADIENT,
  FALLBACK_THEME_ACCENT,
  MIST_BOTTOM_TINT,
  MIST_TOP_TINT,
  themeAccent,
  themeSecondaries,
  PAGE_GRADIENT_ANGLE,
  shade,
  tint,
  type ThemeDefinition,
  sameFill,
  type PageFill,
  type PagePattern,
} from '@livedoc/document';

// The background edit itself is the document's, shared with the agents' page changes.
export { PAGE_GRADIENT_ANGLE, sameFill, withBackgroundPatch } from '@livedoc/document';

type GradientPreset = { id: string; label: string; from: string; to: string };

// The plain paper as the canvas shows it (a sheet with no fill: white, or slate in dark mode), for
// what draws a page as it looks on screen (the Map, the Contents and Slides pictures). An export
// prints it white.
export const CANVAS_PAPER: Readonly<Record<'light' | 'dark', string>> = {
  light: '#ffffff',
  dark: '#0f172a',
};

export const PAGE_GRADIENT_PRESETS: readonly GradientPreset[] = [
  { id: 'sunrise', label: 'Sunrise', from: '#fde68a', to: '#fca5a5' },
  { id: 'peach', label: 'Peach', from: '#fed7aa', to: '#fecdd3' },
  { id: 'rose', label: 'Rose', from: '#ffe4e6', to: '#fbcfe8' },
  { id: 'lavender', label: 'Lavender', from: '#e9d5ff', to: '#fbcfe8' },
  { id: 'ocean', label: 'Ocean', from: '#bae6fd', to: '#c7d2fe' },
  { id: 'meadow', label: 'Meadow', from: '#bbf7d0', to: '#a5f3fc' },
  { id: 'mint', label: 'Mint', from: '#ccfbf1', to: '#d9f99d' },
  { id: 'sand', label: 'Sand', from: '#fef3c7', to: '#e7e5e4' },
  // A new slide document's slide (defaultPageBackground).
  { id: 'steel', label: 'Steel', ...STEEL_GRADIENT },
  { id: 'dusk', label: 'Dusk', from: '#1e1b4b', to: '#4c1d95' },
  { id: 'night', label: 'Night', from: '#0f172a', to: '#1e3a8a' },
  { id: 'forest', label: 'Forest', from: '#052e16', to: '#115e59' },
  { id: 'ember', label: 'Ember', from: '#7c2d12', to: '#be123c' },
];

export const PAGE_PATTERN_LABEL: Record<PagePattern | 'none', string> = {
  none: 'None',
  dots: 'Dots',
  grid: 'Grid',
  lines: 'Lines',
};

// The pattern's pitch in canvas px.

export const gradientFill = (p: Pick<GradientPreset, 'from' | 'to'>): PageFill => ({
  kind: 'gradient',
  from: p.from,
  to: p.to,
  angle: PAGE_GRADIENT_ANGLE,
});

export type ThemeBackgroundPreset = { id: string; label: string; fill: PageFill };

// The theme's accent and its default page background are the document's, shared with every path
// that makes a page.
export { themeAccent } from '@livedoc/document';
const FALLBACK_ACCENT = FALLBACK_THEME_ACCENT;
const isHex = (c: string | null | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);

/**
 * Gradients drawn from the tab's theme (docs/specs/007-editor/pages-mode.md "Backgrounds"),
 * the Gradient category's Theme row: fourteen, seven light then seven bold and deep, from its
 * accent, its second colour and its third (a multi-colour theme's next branches, else the accent
 * deepened). Its solid colours are the Solid category's Theme Palette. Pure: theme in, presets out.
 */
export function themeBackgroundPresets(
  theme: Pick<ThemeDefinition, 'elementStroke' | 'palette'>,
): ThemeBackgroundPreset[] {
  const a = themeAccent(theme);
  const [b, c] = themeSecondaries(theme);
  const g = (id: string, label: string, from: string, to: string): ThemeBackgroundPreset => ({
    id: `theme-${id}`,
    label: `Theme ${label}`,
    fill: gradientFill({ from, to }),
  });
  return [
    g('dawn', 'dawn', '#ffffff', tint(a, 0.8)),
    g('mist', 'mist', tint(a, MIST_TOP_TINT), tint(a, MIST_BOTTOM_TINT)),
    g('glow', 'glow', tint(a, 0.85), tint(b, 0.7)),
    g('haze', 'haze', tint(b, 0.92), tint(a, 0.8)),
    g('sorbet', 'sorbet', tint(b, 0.85), tint(c, 0.75)),
    g('pastel', 'pastel', tint(c, 0.9), tint(a, 0.78)),
    g('bloom', 'bloom', tint(a, 0.7), tint(b, 0.5)),
    g('bright', 'bright', a, b),
    g('vivid', 'vivid', tint(a, 0.15), shade(a, 0.35)),
    g('aurora', 'aurora', shade(a, 0.3), shade(b, 0.1)),
    g('ember', 'ember', b, shade(c, 0.5)),
    // A new infographic page's own background (defaultPageBackground).
    g('dusk', 'dusk', shade(a, DUSK_TOP_SHADE), shade(b, DUSK_BOTTOM_SHADE)),
    g('twilight', 'twilight', shade(b, 0.6), shade(a, 0.8)),
    g('ink', 'ink', shade(a, 0.75), '#0f172a'),
  ];
}

/** The theme accent the theme's gradients were drawn from (Theme bright runs from it): a page
 *  picture's Tint, where only the presets are at hand. */
export function themePresetAccent(presets: readonly ThemeBackgroundPreset[]): string {
  const bright = presets.find((p) => p.id === 'theme-bright')?.fill;
  return bright?.kind === 'gradient' && isHex(bright.from) ? bright.from : FALLBACK_ACCENT;
}

/** The Background section's categories (docs/specs/007-editor/pages-mode.md "Backgrounds"). */
export type BackgroundCategory = 'solid' | 'gradient' | 'image' | 'animated';

/** The category a page's fill belongs to: Animated for a gradient with a motion, Gradient for any
 *  other gradient (a theme's, a preset or a custom one), Image for a picture, else Solid (the paper
 *  and every solid colour). */
export function backgroundCategoryOf(fill: PageFill | undefined): BackgroundCategory {
  if (fill?.kind === 'gradient') return fill.motion ? 'animated' : 'gradient';
  return fill?.kind === 'image' ? 'image' : 'solid';
}

/** Whether the fill is a gradient no preset (of the catalogue or the theme) names: a custom one. */
export function isCustomGradient(
  fill: PageFill | undefined,
  themePresets: readonly ThemeBackgroundPreset[],
): boolean {
  return (
    fill?.kind === 'gradient' &&
    !fill.motion &&
    !PAGE_GRADIENT_PRESETS.some((g) => sameFill(fill, gradientFill(g))) &&
    !themePresets.some((t) => sameFill(fill, t.fill))
  );
}

// The custom gradient on the plain paper: Sky to Lavender.
const CUSTOM_GRADIENT_START = { from: '#e0f2fe', to: '#ede9fe' };

/** Where a new custom gradient starts: the page's current gradient, else its solid colour to a
 *  deepened version of it, else Sky to Lavender, at the presets' angle. */
export function customGradientSeed(fill: PageFill | undefined): PageFill {
  if (fill?.kind === 'gradient') return fill;
  if (fill?.kind === 'solid') return gradientFill({ from: fill.color, to: shade(fill.color, 0.3) });
  return gradientFill(CUSTOM_GRADIENT_START);
}
