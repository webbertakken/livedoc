// The sizing scale as numbers (docs/specs/004-interface-design/sizing.md "The scale"): every size the chrome draws,
// in px, each step named after its job (D232). Taken from the office shell's measured sizes, one step lower in height
// (plan 0024). theme.css declares the same steps as tokens, in rem (D235); a test keeps the two equal, and the sizing
// guard reads its steps from here.

/** Type steps: [size, line] in px. */
const TYPE = {
  glyph: [10, 12], // D231: a key hint, a count in a badge; never words.
  supporting: [12, 16],
  body: [14, 20],
  'panel-title': [16, 24],
  name: [18, 26],
  'dialog-title': [22, 28],
  'page-title': [24, 32],
} as const satisfies Record<string, readonly [number, number]>;

/** Heights in px, read as `h-`, `min-h-` and `size-<step>`. A canvas drawing tool takes `field`. */
const HEIGHT = { chip: 24, row: 28, field: 32, prominent: 36 } as const;

/** Icon sizes in px, read as `size-<step>`. */
const ICON = { 'icon-chevron': 12, 'icon-row': 16, 'icon-toolbar': 18, 'icon-title': 20 } as const;

/** Drawn shapes in px, read as `size-<step>`: a popover's arrow, one size wherever it points. */
const SHAPE = { arrow: 12 } as const;

/** Radii in px, read as `rounded-<step>`; Tailwind's `full` and `none` complete them. */
const RADIUS = { control: 6, menu: 8, surface: 12 } as const;

export const SIZING_SCALE = {
  type: TYPE,
  height: HEIGHT,
  icon: ICON,
  shape: SHAPE,
  radius: RADIUS,
} as const;

/** Gap steps in Tailwind spacing units (4 px each): 2 inside a group, then 4, 8, 12, 16 and 24 px. */
export const GAP_STEPS = [0, 0.5, 1, 2, 3, 4, 6] as const;

/** A marketing page's layout steps for the space between its sections and columns, in Tailwind spacing units: 32, 48
 * and 64 px (docs/specs/004-interface-design/sizing.md "The other apps", D244). Never the app's. */
export const LAYOUT_GAP_STEPS = [8, 12, 16] as const;

/** A marketing page's display type starts here: a section headline of 30 px or more is off the scale (D244). */
export const DISPLAY_TYPE_MIN_PX = 30;

/** Side padding steps in Tailwind spacing units: 8, 12, 16 and 24 px, and the 2 or 4 px a track or a band insets
 * around its controls (a segmented track, a stepper, the toolbar band). */
export const SIDE_PADDING_STEPS = [0, 0.5, 1, 2, 3, 4, 6] as const;

/** The px of a 16 px root (D235). */
export const ROOT_PX = 16;

/** A px size in rem at the 16 px root, as theme.css writes it. */
export function rem(px: number): string {
  return `${px / ROOT_PX}rem`;
}
