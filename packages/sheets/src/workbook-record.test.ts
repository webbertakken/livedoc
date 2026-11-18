import { describe, expect, it } from 'vitest';
import { WorkbookRecord } from './workbook-record';

const made = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/Amsterdam' });

describe('WorkbookRecord', () => {
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
    expect(WorkbookRecord.withFormat(made, 'xlsx').format).toBe('xlsx');
    expect(made.format).toBe('ods');
  });

  it('reads back what it writes', () => {
    expect(WorkbookRecord.read(JSON.parse(JSON.stringify(made)))).toEqual(made);
  });

  it.each([
    ['nothing', null],
    ['a string', 'ods'],
    ['an unknown format', { ...made, format: 'numbers' }],
    ['no settings', { format: 'ods' }],
    ['settings that are not an object', { format: 'ods', settings: 3 }],
    ['an empty locale', { ...made, settings: { ...made.settings, locale: '' } }],
    ['no time zone', { ...made, settings: { ...made.settings, timeZone: 7 } }],
    ['an unknown recalculation', { ...made, settings: { ...made.settings, recalc: 'second' } }],
    ['no iteration', { ...made, settings: { ...made.settings, iterate: null } }],
    ['a non-boolean switch', { ...made, settings: { ...made.settings, iterate: { on: 1, max: 5, threshold: 0 } } }],
    ['too many iterations', { ...made, settings: { ...made.settings, iterate: { on: true, max: 1001, threshold: 0 } } }],
    ['no iterations', { ...made, settings: { ...made.settings, iterate: { on: true, max: 0, threshold: 0 } } }],
    ['a negative threshold', { ...made, settings: { ...made.settings, iterate: { on: true, max: 5, threshold: -1 } } }],
  ])('refuses %s', (_, raw) => {
    expect(WorkbookRecord.read(raw)).toBeNull();
  });

  it('knows its formats', () => {
    expect(WorkbookRecord.isFormat('fods')).toBe(true);
    expect(WorkbookRecord.isFormat('csv')).toBe(false);
  });
});
