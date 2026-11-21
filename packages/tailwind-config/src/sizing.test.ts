import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAP_STEPS, SIDE_PADDING_STEPS, SIZING_SCALE, rem } from './sizing';

const theme = readFileSync(new URL('../theme.css', import.meta.url), 'utf8');

/** The value a `--name: value;` declaration holds in theme.css. */
function themeValue(name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(theme)?.[1]?.trim();
}

// docs/specs/004-interface-design/sizing.md "The scale": the numbers live once, here, and theme.css declares them.
describe('sizing scale', () => {
  it('holds the spec type steps, size on line', () => {
    expect(SIZING_SCALE.type).toEqual({
      glyph: [10, 12],
      supporting: [12, 16],
      body: [14, 20],
      'panel-title': [16, 24],
      name: [18, 26],
      'dialog-title': [22, 28],
      'page-title': [24, 32],
    });
  });

  it('holds the spec heights, a canvas drawing tool taking the field step', () => {
    expect(SIZING_SCALE.height).toEqual({ chip: 24, row: 28, field: 32, prominent: 36 });
  });

  it('holds the spec icon sizes and radii', () => {
    expect(SIZING_SCALE.icon).toEqual({
      'icon-chevron': 12,
      'icon-row': 16,
      'icon-toolbar': 18,
      'icon-title': 20,
    });
    expect(SIZING_SCALE.radius).toEqual({ control: 6, menu: 8, surface: 12 });
  });

  it('holds the gap and side padding steps in Tailwind spacing units', () => {
    expect(GAP_STEPS.map((step) => step * 4)).toEqual([0, 2, 4, 8, 12, 16, 24]);
    expect(SIDE_PADDING_STEPS.map((step) => step * 4)).toEqual([0, 8, 12, 16, 24]);
  });

  it('writes a px size in rem at a 16 px root (D235)', () => {
    expect(rem(28)).toBe('1.75rem');
    expect(rem(18)).toBe('1.125rem');
    expect(rem(22)).toBe('1.375rem');
  });

  it('declares every type step in theme.css with its line', () => {
    for (const [step, [size, line]] of Object.entries(SIZING_SCALE.type)) {
      expect(themeValue(`--text-${step}`), step).toBe(rem(size));
      expect(themeValue(`--text-${step}--line-height`), step).toBe(rem(line));
    }
  });

  it('declares every height and icon step in theme.css as spacing', () => {
    for (const [step, px] of Object.entries({ ...SIZING_SCALE.height, ...SIZING_SCALE.icon })) {
      expect(themeValue(`--spacing-${step}`), step).toBe(rem(px));
    }
  });

  it('declares every radius step in theme.css', () => {
    for (const [step, px] of Object.entries(SIZING_SCALE.radius)) {
      expect(themeValue(`--radius-${step}`), step).toBe(rem(px));
    }
  });
});
