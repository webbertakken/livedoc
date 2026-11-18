import { describe, expect, it } from 'vitest';
import { emptySheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { WorkbookModel } from './workbook-model';

// docs/specs/029-sheets/spreadsheet.md "What a workbook holds" and "The workbook shape".
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' });
let n = 11;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const sheet = (id: string, title: string) =>
  emptySheet({ id, tabId: `tab-${id}`, title, rand, layout: undefined });

describe('WorkbookModel.problems', () => {
  it('finds none in a sound workbook', () => {
    expect(
      WorkbookModel.problems(WorkbookModel.create(record, [sheet('sheet01', 'Sheet1')])),
    ).toEqual([]);
  });

  it('names a workbook with no sheets, and sheets named against the rules or twice', () => {
    expect(WorkbookModel.problems(WorkbookModel.create(record, []))).toEqual([{ k: 'no_sheets' }]);
    const model = WorkbookModel.create(record, [
      sheet('sheet01', 'Costs'),
      sheet('sheet02', 'costs'),
      sheet('sheet03', 'a/b'),
    ]);
    expect(WorkbookModel.problems(model)).toEqual([
      { k: 'sheet_name_taken', sheetId: 'sheet02' },
      { k: 'sheet_name_invalid', sheetId: 'sheet03' },
    ]);
  });

  it('names a part over a sheet the workbook does not hold', () => {
    const model = {
      ...WorkbookModel.create(record, [sheet('sheet01', 'Sheet1')]),
      objects: [
        {
          id: 'o1',
          sheetId: 'gone01',
          kind: 'chart' as const,
          anchor: { at: 'sheet' as const },
          model: {},
        },
      ],
      kept: [
        {
          id: 'k1',
          format: 'ods' as const,
          part: 'content.xml',
          anchor: { at: 'sheet' as const, sheetId: 'gone02' },
          xml: '',
        },
        {
          id: 'k2',
          format: 'ods' as const,
          part: 'meta.xml',
          anchor: { at: 'workbook' as const },
          xml: '',
        },
      ],
    };
    expect(WorkbookModel.problems(model)).toEqual([
      { k: 'part_orphaned', id: 'o1', sheetId: 'gone01' },
      { k: 'part_orphaned', id: 'k1', sheetId: 'gone02' },
    ]);
  });
});
