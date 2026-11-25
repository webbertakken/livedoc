// standard-mapping.md "The theme in the file" (D218): the theme part written and read, a catalogue theme matched,
// theme colours by index, and the theme's font as the files' default.
import { parseXml, readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { SPREADSHEET_THEMES, STANDARD_THEME, customisedTheme } from '../themes/spreadsheet-theme';
import { readOds } from './ods-read';
import { writeFlatOds } from './ods-write';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';
import type { WorkbookFile } from './workbook-file';
import {
  readXlsxTheme,
  themeColourRefOf,
  xlsxColourOrThemeXml,
  xlsxDefaultFont,
  xlsxThemeXml,
} from './xlsx-theme';
import { SPREADSHEETML_NS } from './xlsx-parts';

const ocean = SPREADSHEET_THEMES[2]!;
const el = (xml: string) => {
  const p = parseXml(xml);
  if (!p.ok) throw new Error('xml');
  return p.root;
};

describe('the theme part', () => {
  it('reads back what it writes, a catalogue theme as itself and another by its name', () => {
    expect(readXlsxTheme(xlsxThemeXml(ocean), ocean.font)).toBe(ocean);
    const custom = customisedTheme(ocean, { colours: { accent1: '#123456' } });
    expect(readXlsxTheme(xlsxThemeXml({ ...custom, name: 'Mine' }), 'Roboto')).toEqual({
      ...custom,
      name: 'Mine',
    });
    expect(readXlsxTheme(xlsxThemeXml(ocean), 'Arial')).toMatchObject({
      id: 'custom',
      name: 'Ocean',
    });
    expect(readXlsxTheme(xlsxThemeXml({ ...ocean, name: ' ' }), 'Arial')!.name).toBe('Custom');
  });
  it('reads none without a theme part, a default font, or every colour', () => {
    expect(readXlsxTheme(undefined, 'Arial')).toBeNull();
    expect(readXlsxTheme('<nope', 'Arial')).toBeNull();
    expect(readXlsxTheme(xlsxThemeXml(ocean).replace(/ name="Ocean"/g, ''), 'Arial')!.name).toBe(
      'Custom',
    );
    expect(readXlsxTheme(xlsxThemeXml(ocean), undefined)).toBeNull();
    expect(
      readXlsxTheme(xlsxThemeXml(ocean).replace(/<a:accent3>.*?<\/a:accent3>/, ''), 'Arial'),
    ).toBeNull();
  });
});

describe('theme colours', () => {
  it('writes a theme colour by its index and any other by its rgb, and reads an untinted one back', () => {
    expect(xlsxColourOrThemeXml('color', 'theme:accent1')).toBe('<color theme="4"/>');
    expect(xlsxColourOrThemeXml('fgColor', 'theme:background')).toBe('<fgColor theme="0"/>');
    expect(xlsxColourOrThemeXml('color', '#12ab34')).toBe('<color rgb="FF12AB34"/>');
    expect(themeColourRefOf(el('<color theme="1"/>'))).toBe('theme:text');
    expect(themeColourRefOf(el('<color theme="10"/>'))).toBe('theme:link');
    expect(themeColourRefOf(el('<color theme="2"/>'))).toBeNull();
    expect(themeColourRefOf(el('<color theme="4" tint="0.4"/>'))).toBeNull();
    expect(themeColourRefOf(el('<color rgb="FF000000"/>'))).toBeNull();
    expect(themeColourRefOf(undefined)).toBeNull();
  });
  it('reads a styles part\u2019s default font, a Strict one\u2019s too', async () => {
    const { xlsxStylesDefaultFont } = await import('./xlsx-styles');
    expect(
      xlsxStylesDefaultFont(
        '<styleSheet xmlns="http://purl.oclc.org/ooxml/spreadsheetml/main"><fonts><font><name val="Aptos"/></font></fonts></styleSheet>',
      ),
    ).toBe('Aptos');
    expect(xlsxStylesDefaultFont(undefined)).toBeUndefined();
    expect(xlsxStylesDefaultFont('<nope')).toBeUndefined();
    const styles = (fonts: string) =>
      el(`<styleSheet xmlns="${SPREADSHEETML_NS}">${fonts}</styleSheet>`);
    expect(
      xlsxDefaultFont(
        styles('<fonts><font><name val="Calibri"/></font></fonts>'),
        SPREADSHEETML_NS,
      ),
    ).toBe('Calibri');
    expect(xlsxDefaultFont(styles('<fonts><font/></fonts>'), SPREADSHEETML_NS)).toBeUndefined();
    expect(xlsxDefaultFont(styles(''), SPREADSHEETML_NS)).toBeUndefined();
  });
});

describe('through a file', () => {
  const book = (theme?: typeof ocean): WorkbookFile => ({
    sheets: [
      {
        name: 'S',
        rows: 2,
        cols: 2,
        cells: [
          {
            r: 0,
            c: 0,
            value: { k: 's', v: 'a' },
            style: { bg: 'theme:accent1', fc: 'theme:text', b: true },
          },
          { r: 1, c: 0, value: { k: 's', v: 'b' }, style: { ff: 'Arial' } },
        ],
      },
    ],
    ...(theme ? { theme } : {}),
  });
  it('writes the theme, its font as the default, and reads both back', async () => {
    const out = writeXlsx(book(ocean), 'T');
    const pkg = await readOoxmlPackage(out.data);
    if (!pkg.ok) throw new Error('pkg');
    const text = (name: string) => new TextDecoder().decode(pkg.package.parts.get(name));
    expect(text('xl/theme/theme1.xml')).toContain(
      '<a:accent1><a:srgbClr val="1A73E8"/></a:accent1>',
    );
    expect(text('xl/styles.xml')).toContain('<font><sz val="10"/><name val="Roboto"/></font>');
    expect(text('xl/styles.xml')).toContain('<fgColor theme="4"/>');
    const read = await readXlsx(out.data);
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.theme).toBe(ocean);
    expect(read.file.sheets[0]!.cells.map((c) => c.style)).toEqual([
      { bg: 'theme:accent1', fc: 'theme:text', b: true },
      { ff: 'Arial' },
    ]);
  });
  it('reads a Standard file as none, and writes ODF\u2019s colours as they are, its default font the theme\u2019s', async () => {
    const read = await readXlsx(writeXlsx(book(), 'T').data);
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.theme).toBeUndefined();
    expect(STANDARD_THEME.font).toBe('Arial');
    const flat = writeFlatOds(book(ocean), 'T').data;
    expect(flat).toContain(`fo:background-color="${ocean.colours.accent1}"`);
    expect(flat).toContain('fo:font-family="Roboto"');
    const back = await readOds(new TextEncoder().encode(flat));
    if (!back.ok) throw new Error(back.rejection);
    expect(back.file.sheets[0]!.cells[0]!.style).toMatchObject({ bg: ocean.colours.accent1 });
  });
});
