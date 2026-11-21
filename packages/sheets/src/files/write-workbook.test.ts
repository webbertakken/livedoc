import { describe, expect, it } from 'vitest';
import { CellMap } from '../cells/cell-map';
import { compileFormula } from '../formula/stored';
import { cellKey, emptyLayout, emptySheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { readOds } from './ods-read';
import { writeWorkbook } from './write-workbook';
import { readXlsx } from './xlsx-read';

// docs/specs/029-sheets/files-and-print.md "Downloading": a spreadsheet leaves as its own ODF form, as a package or flat.
let n = 9;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const sheet = emptySheet({
  id: 'sheetOne1',
  tabId: 't1',
  title: 'Sheet1',
  layout: emptyLayout(rand, 2, 2),
});

describe('writeWorkbook', () => {
  it('writes an ODF package that reads back', async () => {
    const written = writeWorkbook([sheet], record, 'Budget', 'ods');
    const read = await readOds(written.data);
    expect(read.ok && read.file.sheets.map((s) => s.name)).toEqual(['Sheet1']);
  });

  it('writes Excel’s form as a package', async () => {
    const written = writeWorkbook([sheet], record, 'Budget', 'xlsx');
    const read = await readXlsx(written.data);
    expect(read.ok && read.file.sheets.map((s) => s.name)).toEqual(['Sheet1']);
  });

  it('writes the flat form as text', () => {
    const written = writeWorkbook([sheet], record, 'Budget', 'fods');
    expect(new TextDecoder().decode(written.data)).toContain('<office:document');
    expect(written.losses).toEqual([]);
  });

  // settings.md "Calculation": the values cached in the file are worked out as the workbook's settings say.
  it('caches a loop as the workbook’s iterative calculation works it out', () => {
    const { layout } = sheet;
    const compiled = compileFormula('=(A1+10)/2', {
      own: { id: sheet.id, title: sheet.title, layout },
      byTitle: () => undefined,
      byId: () => undefined,
    });
    if (!compiled.ok) throw new Error('formula');
    const looped = {
      ...sheet,
      cells: CellMap.from([
        [cellKey(layout.rows[0]!, layout.cols[0]!), { input: { f: compiled.formula } }],
      ]),
    };
    const on = {
      ...record,
      settings: { ...record.settings, iterate: { on: true, max: 50, threshold: 0.05 } },
    };
    const flat = new TextDecoder().decode(writeWorkbook([looped], on, 'Budget', 'fods').data);
    expect(flat).toContain('office:value="9.9609375"');
  });
});
