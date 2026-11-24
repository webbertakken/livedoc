// Rows and columns through XLSX and ODF (docs/specs/029-sheets/standard-mapping.md "Rows and columns in the file"):
// sizes, hidden lines, nested groups, collapsed groups and the controls' side, written and read back.
import { describe, expect, it } from 'vitest';
import {
  OOXML_CONTENT_TYPES,
  RELATIONSHIP_TYPES,
  readOoxmlPackage,
  writeOoxmlPackage,
} from '@livedoc/office-packages';
import { WORKBOOK_SIZED_AXES_MAX } from '../workbook/workbook-limits';
import { OFFICE_RELATIONSHIPS_NS as R, SPREADSHEETML_NS } from './xlsx-parts';
import { Workbook } from '../engine/workbook';
import { makeSheets } from '../testing/book';
import type { Sheet, SheetLayout } from '../sheet';
import { readOds } from './ods-read';
import { writeOds } from './ods-write';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';
import { sheetsFromFile, workbookFileOf, type FileRead } from './workbook-file';

// A sheet of 20 rows and 8 columns, shaped by position.
function shaped(): Sheet {
  const [sheet] = makeSheets({ S: { A1: 'x' } }, { rows: 20, cols: 8 });
  const { rows: r, cols: c } = sheet!.layout;
  sheet!.layout = {
    ...sheet!.layout,
    rowSize: { [r[2]!]: 40 },
    colSize: { [c[1]!]: 200 },
    hiddenRows: [r[5]!],
    hiddenCols: [c[6]!],
    rowDepth: { [r[8]!]: 1, [r[9]!]: 2, [r[10]!]: 1 },
    rowCollapsed: [{ at: r[9]!, depth: 2 }],
    colDepth: { [c[3]!]: 1, [c[4]!]: 1 },
    colCollapsed: [{ at: c[3]!, depth: 1 }],
    controlsAfter: { c: true },
    // A spreadsheet's own line sizes (D169).
    colWidth: 100,
    rowHeight: 21,
  };
  return sheet!;
}

// A layout's lines by position, to compare across ids.
function byPosition(layout: SheetLayout) {
  const at = (axis: 'r' | 'c') => {
    const ids = axis === 'r' ? layout.rows : layout.cols;
    return (id: string) => ids.indexOf(id);
  };
  const keyed = (axis: 'r' | 'c', rec: Record<string, number> | undefined) =>
    Object.fromEntries(Object.entries(rec ?? {}).map(([id, v]) => [at(axis)(id), v]));
  return {
    rowSize: keyed('r', layout.rowSize),
    colSize: keyed('c', layout.colSize),
    hiddenRows: (layout.hiddenRows ?? []).map(at('r')),
    hiddenCols: (layout.hiddenCols ?? []).map(at('c')),
    rowDepth: keyed('r', layout.rowDepth),
    colDepth: keyed('c', layout.colDepth),
    rowCollapsed: (layout.rowCollapsed ?? []).map((m) => [at('r')(m.at), m.depth]),
    colCollapsed: (layout.colCollapsed ?? []).map((m) => [at('c')(m.at), m.depth]),
    controlsAfter: layout.controlsAfter,
    rowHeight: layout.rowHeight,
    colWidth: layout.colWidth,
  };
}

async function backAgain(sheet: Sheet, write: 'xlsx' | 'ods') {
  const file = workbookFileOf(new Workbook({ sheets: [sheet], locale: 'en-GB' }), [sheet], 'en-GB');
  const read: FileRead =
    write === 'xlsx'
      ? await readXlsx(writeXlsx(file, 'T').data)
      : await readOds(writeOds(file, 'T').data);
  if (!read.ok) throw new Error(read.rejection);
  const made = sheetsFromFile(read.file, 'en-GB');
  expect(made.losses).toEqual([]);
  return byPosition(made.sheets[0]!.layout);
}

describe('rows and columns in files', () => {
  it('come back from XLSX as they went', async () => {
    const sheet = shaped();
    expect(await backAgain(sheet, 'xlsx')).toEqual(byPosition(sheet.layout));
  });

  it('come back from ODF as they went, the controls after as ODF cannot say (D167)', async () => {
    const sheet = shaped();
    expect(await backAgain(sheet, 'ods')).toEqual({
      ...byPosition(sheet.layout),
      controlsAfter: { r: true, c: true },
    });
  });

  it('carry the sheet’s own sizes both ways', async () => {
    const sheet = shaped();
    sheet.layout = { ...sheet.layout, rowHeight: 30, colWidth: 150 };
    for (const format of ['xlsx', 'ods'] as const)
      expect(await backAgain(sheet, format)).toMatchObject({ rowHeight: 30, colWidth: 150 });
  });

  it('give a Plan Sheet’s 120 by 28 to the spreadsheet it opens as (D169)', async () => {
    const sheet = shaped();
    const { colWidth: _w, rowHeight: _h, ...plan } = sheet.layout;
    sheet.layout = plan;
    for (const format of ['xlsx', 'ods'] as const)
      expect(await backAgain(sheet, format)).toMatchObject({ rowHeight: 28, colWidth: 120 });
  });

  it('open a file that says nothing of its sizes at Google’s (D169)', async () => {
    const read = await readXlsx(xlsxWith('', '<row r="1"><c r="A1"><v>1</v></c></row>'));
    if (!read.ok) throw new Error(read.rejection);
    const { layout } = sheetsFromFile(read.file, 'en-GB').sheets[0]!;
    expect([layout.colWidth, layout.rowHeight]).toEqual([100, 21]);
  });
});

// A one-sheet XLSX whose worksheet holds `sheetPr` and `sheetData` as given.
function xlsxWith(sheetPr: string, rows: string): Uint8Array<ArrayBuffer> {
  const encode = (text: string) => new TextEncoder().encode(text);
  return writeOoxmlPackage(
    [
      {
        name: 'xl/workbook.xml',
        contentType: OOXML_CONTENT_TYPES.spreadsheet,
        data: encode(
          `<workbook xmlns="${SPREADSHEETML_NS}" xmlns:r="${R}"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        ),
      },
      {
        name: 'xl/worksheets/sheet1.xml',
        contentType: OOXML_CONTENT_TYPES.worksheet,
        data: encode(
          `<worksheet xmlns="${SPREADSHEETML_NS}">${sheetPr}<sheetData>${rows}</sheetData></worksheet>`,
        ),
      },
    ],
    new Map([
      ['', [{ id: 'rId1', type: RELATIONSHIP_TYPES.officeDocument, target: 'xl/workbook.xml' }]],
      [
        'xl/workbook.xml',
        [{ id: 'rId1', type: RELATIONSHIP_TYPES.worksheet, target: 'worksheets/sheet1.xml' }],
      ],
    ]),
  );
}

describe('a kept sheetPr', () => {
  const grouped = '<row r="2" outlineLevel="1"><c r="A2"><v>1</v></c></row>';

  it('keeps all but its outlinePr and tabColor, and takes LiveDoc’s back when written', async () => {
    const read = await readXlsx(
      xlsxWith(
        '<sheetPr codeName="S1"><tabColor rgb="FFFF0000"/><outlinePr summaryBelow="0"/></sheetPr>',
        grouped,
      ),
    );
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.kept?.items.map((i) => i.xml)).toEqual(['<sheetPr codeName="S1"></sheetPr>']);
    expect(read.file.sheets[0]!.tabColour).toBe('#ff0000');
    const written = await readOoxmlPackage(writeXlsx(read.file, 'T').data);
    if (!written.ok) throw new Error(written.rejection);
    expect(
      new TextDecoder().decode(written.package.parts.get('xl/worksheets/sheet1.xml')),
    ).toContain(
      '<sheetPr codeName="S1"><tabColor rgb="FFFF0000"/><outlinePr summaryBelow="0" summaryRight="0"/></sheetPr>',
    );
  });

  it('names a tab colour by theme, never kept', async () => {
    const read = await readXlsx(xlsxWith('<sheetPr><tabColor theme="4"/></sheetPr>', grouped));
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.kept).toBeUndefined();
    expect(read.file.sheets[0]!.tabColour).toBeUndefined();
    expect(read.losses).toContainEqual({ k: 'kept_unread', count: 1 });
  });

  it('writes a tab colour and a hidden sheet, the first shown sheet open', async () => {
    const sheet = { rows: 1, cols: 1, cells: [] };
    const data = writeXlsx(
      {
        sheets: [
          { ...sheet, name: 'A', hidden: true },
          { ...sheet, name: 'B', tabColour: '#1a73e8' },
        ],
      },
      'T',
    ).data;
    const read = await readXlsx(data);
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets.map((s) => [s.hidden, s.tabColour])).toEqual([
      [true, undefined],
      [undefined, '#1a73e8'],
    ]);
    const parts = await readOoxmlPackage(data);
    if (!parts.ok) throw new Error(parts.rejection);
    const text = (name: string) => new TextDecoder().decode(parts.package.parts.get(name));
    expect(text('xl/workbook.xml')).toContain(
      '<bookViews><workbookView activeTab="1"/></bookViews>',
    );
    expect(text('xl/worksheets/sheet2.xml')).toContain(
      '<sheetPr><tabColor rgb="FF1A73E8"/></sheetPr>',
    );
  });

  it('is not kept when it held only its outlinePr', async () => {
    const read = await readXlsx(
      xlsxWith('<sheetPr><outlinePr summaryBelow="0"/></sheetPr>', grouped),
    );
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.kept).toBeUndefined();
    expect(read.file.sheets[0]!.lines?.r?.after).toBeUndefined();
  });
});

describe('limits', () => {
  it('names sized lines past the most a workbook holds (sizes_cut)', () => {
    const rows = WORKBOOK_SIZED_AXES_MAX + 1;
    const lines = new Map(Array.from({ length: rows }, (_, p) => [p, { size: 40 }] as const));
    const made = sheetsFromFile(
      { sheets: [{ name: 'S', rows, cols: 1, cells: [], lines: { r: { lines, collapsed: [] } } }] },
      'en-GB',
    );
    expect(made.losses).toEqual([{ k: 'sizes_cut', sheet: 'S' }]);
  });

  it('writes lines past the sheet’s grid nowhere', async () => {
    const sheet = shaped();
    const file = workbookFileOf(
      new Workbook({ sheets: [sheet], locale: 'en-GB' }),
      [sheet],
      'en-GB',
    );
    const lines = new Map(file.sheets[0]!.lines!.r!.lines).set(500, { size: 40 });
    const written = writeOds(
      {
        sheets: [
          {
            ...file.sheets[0]!,
            lines: { ...file.sheets[0]!.lines, r: { ...file.sheets[0]!.lines!.r!, lines } },
          },
        ],
      },
      'T',
    );
    const read = await readOds(written.data);
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets[0]!.lines?.r?.lines.has(500)).toBe(false);
  });
});
