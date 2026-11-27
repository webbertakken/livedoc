// docs/specs/029-sheets/standard-mapping.md "Named functions in the file" (D324 to D326): XLSX holds each named
// function as a workbook's named LAMBDA both ways; ODF holds none, which its writes and conversions name.
import { readOoxmlPackage } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { CellMap } from '../cells/cell-map';
import { compileFormula, type SheetsCtx } from '../formula/stored';
import { definitionFormula, withTypedDefinition } from '../named-function-refs';
import type { NamedFunction } from '../named-functions';
import { cellKey, emptyLayout, emptySheet, type Sheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { conversionLine } from './conversion-copy';
import { workbookConversion } from './conversion';
import { excelLambda, xlsxFunctionNames, type FileFunction } from './file-functions';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import type { KeptContent } from './kept-content';
import { sheetsFromFile, type FileLoss, type WorkbookFile } from './workbook-file';
import { writeWorkbook } from './write-workbook';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';

let n = 7;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const data = emptySheet({
  id: 'sheetData1',
  tabId: 't1',
  title: 'Data',
  layout: emptyLayout(rand, 4, 3),
});

function ctxOf(sheets: readonly Sheet[], own = sheets[0]!): SheetsCtx {
  const handles = sheets.map((s) => ({ id: s.id, title: s.title, layout: s.layout }));
  return {
    own: handles.find((h) => h.id === own.id)!,
    byTitle: (title) => handles.find((h) => h.title.toLowerCase() === title.toLowerCase()),
    byId: (id) => handles.find((h) => h.id === id),
  };
}

const defined = (fn: NamedFunction, typed: string, sheets: readonly Sheet[] = [data]) =>
  withTypedDefinition(fn, typed, ctxOf(sheets), 'en-GB');

const TWICE: NamedFunction = {
  name: 'TWICE',
  params: ['x'],
  body: '=x*2',
  description: 'Doubles a value',
};

async function readOk(bytes: Uint8Array<ArrayBuffer>) {
  const read = await readXlsx(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return read;
}

async function workbookPart(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const read = await readOoxmlPackage(bytes);
  if (!read.ok) throw new Error(read.rejection);
  return new TextDecoder().decode(read.package.parts.get('xl/workbook.xml'));
}

// A file another app wrote: its workbook holding `names` as kept workbook defined names.
function fileWithNames(...names: string[]): Uint8Array<ArrayBuffer> {
  const kept: KeptContent = {
    standard: 'ooxml',
    items: names.map((xml) => ({
      place: 'workbook' as const,
      xml,
      ns: { '': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main' },
      at: xml.includes('localSheetId') ? { sheet: 0 } : {},
    })),
    parts: [],
    relationships: [],
  };
  const file: WorkbookFile = { sheets: [{ name: 'Data', rows: 4, cols: 3, cells: [] }], kept };
  return writeXlsx(file, 'Book').data;
}

const withRecord = (functions: NamedFunction[]) => ({ ...record, functions });

describe('named functions written to XLSX', () => {
  it('writes each as a workbook’s named LAMBDA, its description the comment', async () => {
    const written = writeWorkbook([data], withRecord([TWICE]), 'Book', 'xlsx');
    expect(await workbookPart(written.data)).toContain(
      '<definedNames><definedName name="TWICE" comment="Doubles a value">_xlfn.LAMBDA(_xlpm.x,_xlpm.x*2)</definedName></definedNames>',
    );
    expect(written.losses).toEqual([]);
  });

  it('writes a reference with its sheet and absolute', () => {
    const fn = defined({ name: 'TOTAL', params: [], body: '' }, '=SUM(A1:A3)');
    const fileFn: FileFunction = {
      name: 'TOTAL',
      params: [],
      body: definitionFormula(fn, ctxOf([data])),
    };
    expect(excelLambda(fileFn, new Map())).toBe('_xlfn.LAMBDA(SUM(Data!$A$1:$A$3))');
  });

  it('wraps a definition Excel cannot hold by S5’s convention inside its LAMBDA', () => {
    const fn: FileFunction = { name: 'GREET', params: ['who'], body: '=DETECTLANGUAGE(who)' };
    expect(excelLambda(fn, new Map())).toBe(
      '_xlfn.LAMBDA(_xlpm.who,IFERROR(__xludf.DUMMYFUNCTION("DETECTLANGUAGE(who)"),""))',
    );
  });

  it('cuts a description to Excel’s 255 characters and leaves argument help out, naming both', () => {
    const losses: FileLoss[] = [];
    const long = { name: 'LONG', params: ['x'], body: '=x', description: 'd'.repeat(300) };
    const hinted = { name: 'HINTED', params: ['x'], body: '=x', hinted: true as const };
    const { names } = xlsxFunctionNames([long, hinted], new Map(), losses);
    expect(names[0]).toContain(` comment="${'d'.repeat(255)}">`);
    expect(names[1]).not.toContain('comment');
    expect(losses).toEqual([
      { k: 'function_cut', name: 'LONG' },
      { k: 'function_cut', name: 'HINTED' },
    ]);
  });

  it('leaves out a name Excel refuses and one past Excel’s formula length, naming them', () => {
    const losses: FileLoss[] = [];
    const wide = { name: 'WIDE', params: ['x'.repeat(9_000)], body: '=1' };
    const out = xlsxFunctionNames([{ name: 'R', params: [], body: '=1' }, wide], new Map(), losses);
    expect(out.names).toEqual([]);
    expect(losses).toEqual([
      { k: 'function_unwritten', name: 'R' },
      { k: 'function_unwritten', name: 'WIDE' },
    ]);
  });

  it('drops a kept workbook name a named function takes, counted, and keeps a sheet’s', async () => {
    const other = fileWithNames(
      '<definedName name="Twice">Data!$A$1</definedName>',
      '<definedName name="TWICE" localSheetId="0">Data!$B$1</definedName>',
      '<definedName>Data!$C$1</definedName>',
    );
    const read = await readOk(other);
    const file: WorkbookFile = {
      ...read.file,
      functions: [{ name: 'TWICE', params: ['x'], body: '=x*2' }],
    };
    const written = writeXlsx(file, 'Book');
    const xml = await workbookPart(written.data);
    expect(xml).not.toContain('Data!$A$1');
    expect(xml).toContain('<definedName name="TWICE" localSheetId="0">Data!$B$1</definedName>');
    expect(xml).toContain('<definedName>Data!$C$1</definedName>');
    expect(xml).toContain('_xlfn.LAMBDA(_xlpm.x,_xlpm.x*2)');
    expect(written.losses).toContainEqual({ k: 'kept_dropped', count: 1 });
  });

  it('names argument help the file cannot hold', () => {
    const hinted = { ...TWICE, hints: [{ description: 'A number' }] };
    expect(writeWorkbook([data], withRecord([hinted]), 'Book', 'xlsx').losses).toEqual([
      { k: 'function_cut', name: 'TWICE' },
    ]);
  });

  it('works a named function’s calls out in the file’s cached values', async () => {
    const ctx = ctxOf([data]);
    const compiled = compileFormula('=TWICE(3)', ctx);
    if (!compiled.ok) throw new Error('formula');
    const called = {
      ...data,
      cells: CellMap.from([
        [cellKey(data.layout.rows[0]!, data.layout.cols[0]!), { input: { f: compiled.formula } }],
      ]),
    };
    const read = await readOk(writeWorkbook([called], withRecord([TWICE]), 'Book', 'xlsx').data);
    expect(read.file.sheets[0]!.cells[0]).toMatchObject({
      formula: '=TWICE(3)',
      value: { k: 'n', v: 6 },
    });
  });
});

describe('named functions read from XLSX', () => {
  it('round trips name, placeholders, description, definition and references, a sheet renamed between', async () => {
    const totals = emptySheet({
      id: 'sheetTotal1',
      tabId: 't2',
      title: 'Totals',
      layout: emptyLayout(rand, 3, 3),
    });
    const fn = defined(
      { name: 'SCALED', params: ['x'], body: '', description: 'x by the rate' },
      '=x*Totals!B2',
      [data, totals],
    );
    const renamed = { ...totals, title: 'Rates' };
    const written = writeWorkbook([data, renamed], withRecord([TWICE, fn]), 'Book', 'xlsx');
    const read = await readOk(written.data);
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.losses).toEqual([]);
    expect(made.kept).toBeUndefined();
    const [scaled, twice] = made.functions!;
    expect(twice).toEqual(TWICE);
    expect(scaled).toMatchObject({ name: 'SCALED', params: ['x'], description: 'x by the rate' });
    const sheets = made.sheets.map((s) =>
      emptySheet({ id: s.id, tabId: s.id, title: s.title, layout: s.layout }),
    );
    expect(definitionFormula(scaled!, ctxOf(sheets))).toBe('=x*Rates!$B$2');
    expect(scaled!.refs).toEqual([expect.objectContaining({ s: made.sheets[1]!.id, a: 15 })]);
  });

  it('reads S5’s wrap inside a LAMBDA back as the definition it keeps', async () => {
    const greet = { name: 'GREET', params: ['who'], body: '=DETECTLANGUAGE(who)' };
    const read = await readOk(writeWorkbook([data], withRecord([greet]), 'Book', 'xlsx').data);
    expect(sheetsFromFile(read.file, 'en-GB', rand).functions).toEqual([greet]);
  });

  it('reads a LAMBDA of no placeholders, and one naming no sheet against the first', async () => {
    const read = await readOk(
      fileWithNames('<definedName name="FIRST">_xlfn.LAMBDA($A$1+1)</definedName>'),
    );
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    const [first] = made.functions!;
    expect(first).toMatchObject({ name: 'FIRST', params: [], body: '=@0+1' });
    expect(first!.refs).toEqual([expect.objectContaining({ s: made.sheets[0]!.id })]);
  });

  it('keeps a defined name that is no LAMBDA of placeholders, and a sheet’s LAMBDA', async () => {
    const names = [
      '<definedName name="Total">Data!$A$1</definedName>',
      '<definedName name="CALL">_xlfn.LAMBDA(_xlpm.x,_xlpm.x)(1)</definedName>',
      '<definedName name="ODD">_xlfn.LAMBDA(1,2)</definedName>',
      '<definedName name="EMPTY">_xlfn.LAMBDA()</definedName>',
      '<definedName name="SPILL">_xlfn.ANCHORARRAY(1)</definedName>',
      '<definedName name="MINE" localSheetId="0">_xlfn.LAMBDA(_xlpm.x,_xlpm.x)</definedName>',
    ];
    const read = await readOk(fileWithNames(...names));
    expect(read.file.functions).toBeUndefined();
    expect(read.file.kept!.items.filter((i) => i.xml.startsWith('<definedName'))).toHaveLength(6);
  });

  it('keeps one LiveDoc cannot hold as it came, naming it, and writes it back', async () => {
    const refused = '<definedName name="SUM">_xlfn.LAMBDA(_xlpm.x,_xlpm.x)</definedName>';
    const read = await readOk(
      fileWithNames(refused, '<definedName name="ID">_xlfn.LAMBDA(_xlpm.x,_xlpm.x)</definedName>'),
    );
    const made = sheetsFromFile(read.file, 'en-GB', rand);
    expect(made.functions!.map((f) => f.name)).toEqual(['ID']);
    expect(made.losses).toEqual([{ k: 'function_unread', name: 'SUM' }]);
    expect(made.kept!.items.map((i) => i.xml)).toEqual([refused]);
    const report = importReport(made.losses);
    expect(report.map(importReportLine)).toEqual([
      '1 named function LiveDoc cannot read is kept for Excel: SUM',
    ]);
  });

  it('keeps those past the most a spreadsheet holds', async () => {
    const names = Array.from(
      { length: 101 },
      (_, i) => `<definedName name="F${String(i).padStart(3, '0')}X">_xlfn.LAMBDA(1)</definedName>`,
    );
    const made = sheetsFromFile((await readOk(fileWithNames(...names))).file, 'en-GB', rand);
    expect(made.functions).toHaveLength(100);
    expect(made.losses).toEqual([{ k: 'function_unread', name: 'F100X' }]);
    expect(made.kept!.items).toHaveLength(1);
  });

  it('keeps one whose definition does not read', () => {
    const fn: FileFunction = { name: 'BAD', params: [], body: '=SUM(' };
    const kept = { place: 'workbook' as const, xml: '<definedName name="BAD"/>', ns: {}, at: {} };
    const made = sheetsFromFile(
      {
        sheets: [{ name: 'Data', rows: 1, cols: 1, cells: [] }],
        functions: [
          { ...fn, kept },
          { ...fn, name: 'MADE' },
        ],
      },
      'en-GB',
      rand,
    );
    expect(made.functions).toBeUndefined();
    expect(made.losses.map((l) => l.k)).toEqual(['function_unread', 'function_unread']);
    expect(made.kept!.items.map((i) => i.xml)).toEqual(['<definedName name="BAD"/>']);
  });

  it('carries the functions into the record a file opens as', () => {
    const opened = WorkbookRecord.opened(record, 'xlsx', undefined, [TWICE]);
    expect(opened.functions).toEqual([TWICE]);
    expect(WorkbookRecord.opened(record, 'xlsx', undefined, []).functions).toBeUndefined();
  });
});

describe('named functions and OpenDocument', () => {
  it('names each one an ODF write leaves out', () => {
    for (const format of ['ods', 'fods'] as const)
      expect(writeWorkbook([data], withRecord([TWICE]), 'Book', format).losses).toEqual([
        { k: 'function_unwritten', name: 'TWICE' },
      ]);
  });

  it('lists them first when converting to OpenDocument, and not to Excel', () => {
    const xlsx = { ...withRecord([{ ...TWICE, name: 'THRICE' }, TWICE]), format: 'xlsx' as const };
    const conversion = workbookConversion([data], xlsx, 'ods');
    expect(conversion.losses[0]).toEqual({
      k: 'functions_left',
      count: 2,
      names: ['THRICE', 'TWICE'],
    });
    expect(conversionLine(conversion.losses[0]!, 'ods')).toBe(
      '2 named functions are left out: THRICE and TWICE',
    );
    expect(conversionLine({ k: 'functions_left', count: 1, names: ['TWICE'] }, 'ods')).toBe(
      '1 named function is left out: TWICE',
    );
    const ods = { ...xlsx, format: 'ods' as const };
    expect(workbookConversion([data], ods, 'xlsx').losses).toEqual([]);
  });
});
