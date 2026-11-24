import { describe, expect, it } from 'vitest';
import { WorkbookRecord, WORKBOOK_RANGE_SOURCES_MAX } from './workbook-record';

const made = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/Amsterdam' });

describe('WorkbookRecord', () => {
  it('gives a copied sheet a new spreadsheet with the format, meaning and settings, never the imports', () => {
    const made = WorkbookRecord.create({ locale: 'nl-NL', timeZone: 'Europe/Amsterdam' });
    const opened = { ...WorkbookRecord.opened(made, 'xlsx'), importsAllowed: true as const };
    expect(WorkbookRecord.copied(opened)).toEqual({
      format: 'xlsx',
      settings: made.settings,
      meaning: 'ooxml',
    });
    expect(WorkbookRecord.copied(made)).toEqual(made);
  });

  // spreadsheet.md "Making a spreadsheet": born in ODF (C5); settings.md "Calculation" defaults.
  it('is born in ODF with the maker settings and Google defaults', () => {
    expect(made).toEqual({
      format: 'ods',
      settings: {
        locale: 'en-GB',
        timeZone: 'Europe/Amsterdam',
        recalc: 'change',
        iterate: { on: false, max: 50, threshold: 0.05 },
      },
    });
  });

  it('changes its format only when asked', () => {
    expect(WorkbookRecord.converted(made, 'xlsx').format).toBe('xlsx');
    expect(made.format).toBe('ods');
  });

  it('reads back what it writes', () => {
    expect(WorkbookRecord.read(JSON.parse(JSON.stringify(made)))).toEqual(made);
  });

  // formulas.md, the file's meaning: a standard's, kept; absent, Google's (D101); anything else is no record.
  it("keeps a file's meaning, and refuses one that is not", () => {
    expect(WorkbookRecord.meaningOf('xlsx')).toBe('ooxml');
    expect(WorkbookRecord.meaningOf('ods')).toBe('openformula');
    expect(WorkbookRecord.meaningOf('fods')).toBe('openformula');
    const opened = WorkbookRecord.opened(made, 'xlsx');
    expect(opened).toEqual({ ...made, format: 'xlsx', meaning: 'ooxml' });
    expect(made.meaning).toBeUndefined();
    expect(WorkbookRecord.read(JSON.parse(JSON.stringify(opened)))).toEqual(opened);
    expect(WorkbookRecord.read({ ...made, meaning: 'openformula' })?.meaning).toBe('openformula');
    expect(WorkbookRecord.read({ ...made, meaning: 'google' })).toBeNull();
    expect(WorkbookRecord.read({ ...made, meaning: 1 })).toBeNull();
  });

  // D100: converting gives a file's meaning the new format's; a spreadsheet made in LiveDoc keeps Google's.
  it('converts its meaning with its format only when it has a file’s', () => {
    const opened = WorkbookRecord.opened(made, 'fods');
    expect(WorkbookRecord.converted(opened, 'xlsx')).toEqual({
      ...opened,
      format: 'xlsx',
      meaning: 'ooxml',
    });
    expect(WorkbookRecord.converted(made, 'xlsx')).toEqual({ ...made, format: 'xlsx' });
  });

  it('keeps imports allowed only when they are (imports.md "Allow access")', () => {
    expect(WorkbookRecord.read({ ...made, importsAllowed: true })).toEqual({
      ...made,
      importsAllowed: true,
    });
    expect(WorkbookRecord.read({ ...made, importsAllowed: false })).toEqual(made);
    expect(WorkbookRecord.read({ ...made, importsAllowed: 1 })).toEqual(made);
  });

  it('keeps the spreadsheets its IMPORTRANGEs read (formulas.md "Connecting two spreadsheets")', () => {
    expect(WorkbookRecord.read({ ...made, rangeSources: ['a_1', 'b-2'] })).toEqual({
      ...made,
      rangeSources: ['a_1', 'b-2'],
    });
    const many = Array.from({ length: WORKBOOK_RANGE_SOURCES_MAX + 1 }, (_, i) => `s${i}`);
    for (const bad of [[], ['a', 'a'], ['a b'], [1], 'a', many, ['x'.repeat(201)]])
      expect(WorkbookRecord.read({ ...made, rangeSources: bad })).toBeNull();
  });

  it.each([
    ['nothing', null],
    ['a string', 'ods'],
    ['an unknown format', { ...made, format: 'numbers' }],
    ['no settings', { format: 'ods' }],
    ['settings that are not an object', { format: 'ods', settings: 3 }],
    ['an empty locale', { ...made, settings: { ...made.settings, locale: '' } }],
    ['no time zone', { ...made, settings: { ...made.settings, timeZone: 7 } }],
    [
      'a locale past 64 characters',
      { ...made, settings: { ...made.settings, locale: 'x'.repeat(65) } },
    ],
    [
      'a time zone past 64 characters',
      { ...made, settings: { ...made.settings, timeZone: 'x'.repeat(65) } },
    ],
    ['an unknown recalculation', { ...made, settings: { ...made.settings, recalc: 'second' } }],
    ['no iteration', { ...made, settings: { ...made.settings, iterate: null } }],
    [
      'a non-boolean switch',
      { ...made, settings: { ...made.settings, iterate: { on: 1, max: 5, threshold: 0 } } },
    ],
    [
      'too many iterations',
      { ...made, settings: { ...made.settings, iterate: { on: true, max: 1001, threshold: 0 } } },
    ],
    [
      'no iterations',
      { ...made, settings: { ...made.settings, iterate: { on: true, max: 0, threshold: 0 } } },
    ],
    [
      'a negative threshold',
      { ...made, settings: { ...made.settings, iterate: { on: true, max: 5, threshold: -1 } } },
    ],
  ])('refuses %s', (_, raw) => {
    expect(WorkbookRecord.read(raw)).toBeNull();
  });

  // sheet-store.md "Changing the workbook": settings are saved whole, refused when any is not one.
  it('reads settings on their own', () => {
    expect(WorkbookRecord.readSettings(JSON.parse(JSON.stringify(made.settings)))).toEqual(
      made.settings,
    );
    expect(WorkbookRecord.readSettings({ ...made.settings, recalc: 'never' })).toBeNull();
    expect(
      WorkbookRecord.readSettings({ ...made.settings, locale: 'x'.repeat(64) }),
    ).not.toBeNull();
  });

  it('knows its formats', () => {
    expect(WorkbookRecord.isFormat('fods')).toBe(true);
    expect(WorkbookRecord.isFormat('csv')).toBe(false);
    // standard-mapping.md "One model, two mappings": ODF's two forms are one standard, XLSX another (fork C1).
    expect(WorkbookRecord.sameStandard('ods', 'fods')).toBe(true);
    expect(WorkbookRecord.sameStandard('xlsx', 'xlsx')).toBe(true);
    expect(WorkbookRecord.sameStandard('xlsx', 'ods')).toBe(false);
  });
});
