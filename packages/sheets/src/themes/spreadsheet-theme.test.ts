// Themes (docs/specs/029-sheets/formatting.md "Themes", D217): the catalogue, theme colours named in a cell's format
// and drawn in the workbook's theme, and what a theme from the wire may be.
import { describe, expect, it } from 'vitest';
import { validFormatValue } from '../format';
import {
  customisedTheme,
  isThemeColourRef,
  readTheme,
  resolveColour,
  SPREADSHEET_THEMES,
  STANDARD_THEME,
  THEME_COLOUR_KEYS,
  themeColourRef,
  themeOf,
  themedFormat,
} from './spreadsheet-theme';

describe('the catalogue', () => {
  it('holds eight themes, Standard first, each with every colour', () => {
    expect(SPREADSHEET_THEMES).toHaveLength(8);
    expect(SPREADSHEET_THEMES[0]).toBe(STANDARD_THEME);
    expect(STANDARD_THEME).toMatchObject({ id: 'standard', name: 'Standard', font: 'Arial' });
    for (const t of SPREADSHEET_THEMES) {
      expect(Object.keys(t.colours).sort()).toEqual([...THEME_COLOUR_KEYS].sort());
      expect(readTheme(t)).toEqual(t);
    }
    expect(new Set(SPREADSHEET_THEMES.map((t) => t.id)).size).toBe(8);
  });
});

describe('theme colours in a format', () => {
  it('names a theme colour and draws it in the theme', () => {
    expect(themeColourRef('accent1')).toBe('theme:accent1');
    expect(isThemeColourRef('theme:link')).toBe(true);
    expect(isThemeColourRef('theme:nope')).toBe(false);
    expect(isThemeColourRef(3)).toBe(false);
    expect(validFormatValue('fc', 'theme:accent2')).toBe(true);
    expect(validFormatValue('bg', 'theme:nope')).toBe(false);
    const ocean = SPREADSHEET_THEMES[2]!;
    expect(resolveColour('theme:accent1', ocean)).toBe(ocean.colours.accent1);
    expect(resolveColour('#123456', ocean)).toBe('#123456');
    expect(resolveColour(undefined, ocean)).toBeUndefined();
    const f = { b: true as const, fc: 'theme:text', bg: 'theme:accent3' };
    expect(themedFormat(f, ocean)).toEqual({
      b: true,
      fc: ocean.colours.text,
      bg: ocean.colours.accent3,
    });
    const plain = { fc: '#000000' };
    expect(themedFormat(plain, ocean)).toBe(plain);
    expect(themedFormat(undefined, ocean)).toBeUndefined();
    expect(themedFormat({ fc: 'theme:text' }, ocean)).toEqual({ fc: ocean.colours.text });
    expect(themedFormat({ bg: 'theme:link' }, ocean)).toEqual({ bg: ocean.colours.link });
  });
});

describe('a theme from the wire', () => {
  it('reads a theme, a customised one too, and nothing else', () => {
    const custom = customisedTheme(STANDARD_THEME, {
      font: 'Roboto',
      colours: { accent1: '#112233' },
    });
    expect(custom).toMatchObject({ id: 'custom', name: 'Custom', font: 'Roboto' });
    expect(custom.colours.accent1).toBe('#112233');
    expect(readTheme(custom)).toEqual(custom);
    expect(customisedTheme(STANDARD_THEME, {}).font).toBe('Arial');
    for (const bad of [
      null,
      'x',
      { ...custom, id: 'nope' },
      { ...custom, name: 'x'.repeat(101) },
      { ...custom, font: '' },
      { ...custom, font: 'x'.repeat(101) },
      { ...custom, colours: { ...custom.colours, text: 'red' } },
      { ...custom, colours: { ...custom.colours, extra: '#000000' } },
      { ...custom, colours: 'x' },
      { ...custom, extra: 1 },
    ])
      expect(readTheme(bad)).toBeNull();
  });
  it('gives a workbook without one Standard', () => {
    expect(themeOf(undefined)).toBe(STANDARD_THEME);
    expect(themeOf(SPREADSHEET_THEMES[1])).toBe(SPREADSHEET_THEMES[1]);
  });
});

describe('in the workbook', () => {
  it('draws, copies and writes a cell in the workbook\u2019s theme, and its settings keep the theme', async () => {
    const { book } = await import('../testing/book');
    const { renderWindow } = await import('../engine/render');
    const { workbookFileOf } = await import('../files/workbook-file');
    const { clipToHtml } = await import('../clipboard-html');
    const { clipFromRange } = await import('../clipboard');
    const { WorkbookRecord } = await import('../workbook-record');
    const b = book({ A1: 'x' }, { rows: 4, cols: 2 });
    const s = b.sheets[0]!;
    const key = [...s.cells.keys()][0]!;
    s.cells.set(key, {
      ...s.cells.get(key)!,
      format: { fc: 'theme:accent1', bg: 'theme:background' },
    });
    b.wb.updateSheet(s);
    const ocean = SPREADSHEET_THEMES[2]!;
    const v = b.wb.version;
    b.wb.setTheme(ocean);
    b.wb.setTheme(ocean);
    expect(b.wb.version).toBe(v + 1);
    const cell = renderWindow(b.wb, s.id, { width: 300, height: 100 }, 'en-GB')!.cells[0]!;
    expect([cell.color, cell.fill]).toEqual([ocean.colours.accent1, ocean.colours.background]);
    // A file keeps the theme colour by name, with the theme (standard-mapping.md "The theme in the file").
    const file = workbookFileOf(b.wb, [s], 'en-GB');
    expect(file.sheets[0]!.cells[0]!.style).toMatchObject({ fc: 'theme:accent1' });
    expect(file.theme).toBe(ocean);
    const clip = clipFromRange(b.wb, s.id, { r1: 0, c1: 0, r2: 0, c2: 0 })!;
    expect(clipToHtml(clip, ocean)).toContain(`color:${ocean.colours.accent1}`);
    expect(clipToHtml(clip)).toContain(`color:${STANDARD_THEME.colours.accent1}`);
    const settings = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' }).settings;
    expect(WorkbookRecord.readSettings({ ...settings, theme: ocean })).toEqual({
      ...settings,
      theme: ocean,
    });
    expect(WorkbookRecord.readSettings({ ...settings, theme: 'x' })).toBeNull();
    expect(WorkbookRecord.readSettings(settings)).toEqual(settings);
  });
});
