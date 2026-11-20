import { describe, expect, it } from 'vitest';
import { emptyLayout, emptySheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { readOds } from './ods-read';
import { writeWorkbook } from './write-workbook';

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

  it('writes the flat form as text', () => {
    const written = writeWorkbook([sheet], record, 'Budget', 'fods');
    expect(new TextDecoder().decode(written.data)).toContain('<office:document');
    expect(written.losses).toEqual([]);
  });
});
