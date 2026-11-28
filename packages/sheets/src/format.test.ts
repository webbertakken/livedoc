import { describe, expect, it } from 'vitest';
import {
  formatEquals,
  isBorder,
  mergeFormat,
  validFormat,
  validFormatPatch,
  validFormatValue,
} from './format';

describe('format validation', () => {
  it.each([
    ['nf', 'percent', true],
    ['nf', 'weird', false],
    ['dp', 2, true],
    ['dp', 11, false],
    ['dp', 1.5, false],
    ['cur', '£', true],
    ['cur', 'X', false],
    ['fc', '#aabbcc', true],
    ['fc', '#ABC', false],
    ['bg', 'red', false],
    // A cell's link (inserted-objects.md "A cell's link", D636).
    ['ln', 'https://docs.nu/', true],
    ['ln', '#gid=sheet1&range=A1', true],
    ['ln', '', false],
    ['ln', 5, false],
    ['ff', 'space-grotesk', true],
    // A family by name (formatting.md "Font"): letters, digits, spaces, dots, hyphens, underscores, up to 64.
    ['ff', 'Lora', true],
    ['ff', 'Roboto Mono', true],
    ['ff', 'M PLUS Rounded 1c', true],
    ['ff', 'メイリオ', true],
    ['ff', 'a'.repeat(64), true],
    ['ff', 'a'.repeat(65), false],
    ['ff', '', false],
    ['ff', ' Lora', false],
    ['ff', 'Lora ', false],
    ['ff', "Lora';color:red", false],
    ['ff', 'Lora, Arial', false],
    ['ff', 3, false],
    ['fs', 13, true],
    ['fs', 15, true],
    ['fs', 5, false],
    ['fs', 400, true],
    ['fs', 401, false],
    ['fs', 12.5, false],
    ['ha', 'c', true],
    ['ha', 'x', false],
    ['va', 'm', true],
    ['va', 'x', false],
    ['wr', 'w', true],
    ['wr', 'x', false],
    // formatting.md "Alignment, wrapping, rotation": a whole angle from −90 to 90, never 0, or stacked.
    ['ro', 45, true],
    ['ro', 'v', true],
    ['ro', 0, false],
    ['ro', 91, false],
    ['b', true, true],
    ['b', false, false],
    ['bt', { w: 1, s: 'solid', c: '#000000' }, true],
    ['bt', { w: 4, s: 'solid', c: '#000000' }, false],
    ['bt', { w: 3, s: 'double', c: '#000000' }, true],
    ['bt', { w: 1, s: 'wavy', c: '#000000' }, false],
    ['bt', { w: 1, s: 'solid', c: '#000000', x: 1 }, false],
    ['bt', null, false],
    ['zz', 1, false],
  ])('%s = %j is %s', (k, v, ok) => {
    expect(validFormatValue(k, v)).toBe(ok);
  });
  it('checks patches and whole formats', () => {
    expect(validFormatPatch({ b: true, fc: null })).toBe(true);
    expect(validFormatPatch({ nope: true })).toBe(false);
    expect(validFormatPatch([])).toBe(false);
    expect(validFormatPatch(null)).toBe(false);
    expect(validFormatPatch({ b: 'yes' })).toBe(false);
    expect(validFormat({ b: true })).toBe(true);
    expect(validFormat({ b: null })).toBe(false);
    expect(isBorder('x')).toBe(false);
  });
});

describe('mergeFormat', () => {
  it('sets, clears and empties', () => {
    expect(mergeFormat(undefined, { b: true })).toEqual({ b: true });
    expect(mergeFormat({ b: true, i: true }, { b: null })).toEqual({ i: true });
    expect(mergeFormat({ b: true }, { b: null })).toBeUndefined();
    expect(mergeFormat({ b: true }, null)).toBeUndefined();
    expect(formatEquals({ b: true }, { b: true })).toBe(true);
    expect(formatEquals(undefined, {})).toBe(true);
  });
});

describe('fontFamilyName', () => {
  it('names a family as itself and an editor font by its id in Title Case', async () => {
    const { fontFamilyName } = await import('./format');
    expect(fontFamilyName('Roboto Mono')).toBe('Roboto Mono');
    expect(fontFamilyName('space-grotesk')).toBe('Space Grotesk');
  });
});

describe('font size steps', () => {
  it('steps through the presets, kept within the limits', async () => {
    const { stepFontSize, FONT_SIZE_MIN, FONT_SIZE_MAX } = await import('./format');
    expect([
      stepFontSize(10, 1),
      stepFontSize(10, -1),
      stepFontSize(15, 1),
      stepFontSize(15, -1),
    ]).toEqual([11, 9, 16, 14]);
    expect([stepFontSize(400, 1), stepFontSize(8, -1)]).toEqual([FONT_SIZE_MAX, FONT_SIZE_MIN]);
    expect(FONT_SIZE_MAX).toBe(400);
  });

  it('steps by ten points past the last preset, up to 400 (D200)', async () => {
    const { stepFontSize } = await import('./format');
    expect([
      stepFontSize(72, 1),
      stepFontSize(80, 1),
      stepFontSize(85, 1),
      stepFontSize(85, -1),
      stepFontSize(80, -1),
      stepFontSize(390, 1),
    ]).toEqual([80, 90, 90, 80, 72, 400]);
  });
});
