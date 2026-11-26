// Validation rules through whole files (docs/specs/029-sheets/standard-mapping.md "Validation in the file", D293 to
// D296): a workbook holding every criterion written as XLSX, ODS and flat ODF reads back with the same rules, by
// position; a flat file whose standard rule another app changed reads that rule, LiveDoc's dropped and named.
import { describe, expect, it } from 'vitest';
import { compileFormula } from '../formula/stored';
import { sheetFromJson } from '../sheet-json';
import type { IdRange, Sheet, ValidationRule } from '../sheet';
import { makeSheets } from '../testing/book';
import { WorkbookRecord, type WorkbookFormat } from '../workbook-record';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile } from './workbook-file';
import { workbookFileFor, writeWorkbook } from './write-workbook';

const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
let n = 7;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const BY = { id: 'x', name: 'x', color: '#000000' };

const box = (r1: number, c1: number, r2 = r1, c2 = c1, s = 0): IdRange => ({
  r1: `s${s}r${r1}`,
  c1: `s${s}c${c1}`,
  r2: `s${s}r${r2}`,
  c2: `s${s}c${c2}`,
});

function workbook(): Sheet[] {
  const sheets = makeSheets(
    { One: { A1: 'x' }, 'My Lists': { A1: 'Red', A2: 'Blue' } },
    { rows: 20, cols: 10 },
  );
  const [one, lists] = sheets as [Sheet, Sheet];
  const ctx = { own: one, byTitle: () => undefined, byId: () => undefined };
  const fx = compileFormula('=B2>A2', ctx);
  if (!fx.ok) throw new Error('formula');
  const rules: ValidationRule[] = [
    {
      id: 'v01',
      ...box(1, 0, 5, 0),
      is: 'list',
      opts: [{ v: 'To Do', c: '#e6f4ea' }, { v: 'Done' }],
      help: 'Pick',
    },
    {
      id: 'v02',
      ...box(6, 0),
      is: 'list',
      opts: [{ v: 'a' }, { v: 'b' }],
      show: 'arrow',
      multi: true,
    },
    { id: 'v03', ...box(7, 0), is: 'list', opts: [{ v: 'x, y' }], show: 'plain' },
    { id: 'v04', ...box(1, 1, 5, 1), is: 'range', src: box(0, 0, 1, 0) },
    {
      id: 'v05',
      ...box(6, 1),
      is: 'range',
      src: { ...box(0, 0, 1, 0, 1), s: lists.id },
      multi: true,
    },
    { id: 'v06', ...box(1, 2), is: 'check' },
    { id: 'v07', ...box(2, 2), is: 'check', on: 'Yes', off: 'No' },
    { id: 'v08', ...box(3, 2), is: 'check', on: 1 },
    { id: 'v09', ...box(1, 3), is: 'num', op: 'between', a: 1, b: 10 },
    { id: 'v10', ...box(2, 3), is: 'num', op: 'notBetween', a: 1, b: 10 },
    { id: 'v11', ...box(3, 3), is: 'num', op: 'gt', a: 5 },
    { id: 'v12', ...box(4, 3), is: 'num', op: 'neq', a: 5, warn: true },
    { id: 'v13', ...box(1, 4), is: 'date', op: 'valid' },
    { id: 'v14', ...box(2, 4), is: 'date', op: 'before', a: 46296 },
    { id: 'v15', ...box(3, 4), is: 'date', op: 'between', a: 46296, b: 46387 },
    { id: 'v16', ...box(1, 5), is: 'text', op: 'contains', a: 'ref' },
    { id: 'v17', ...box(2, 5), is: 'text', op: 'notContains', a: 'x' },
    { id: 'v18', ...box(3, 5), is: 'text', op: 'exactly', a: 'Yes' },
    { id: 'v19', ...box(4, 5), is: 'text', op: 'email' },
    { id: 'v20', ...box(5, 5), is: 'text', op: 'url' },
    {
      id: 'v21',
      ...box(1, 6, 4, 6),
      is: 'formula',
      fx: fx.formula,
      warn: true,
      help: 'Bigger than A',
    },
  ];
  return [{ ...one, layout: { ...one.layout, rules } }, lists];
}

async function reopened(data: Uint8Array) {
  const read = await readWorkbookFile(new Uint8Array(data), 'en-GB');
  if (!read.ok) throw new Error(read.rejection);
  const made = sheetsFromFile(read.file, 'en-GB', rand);
  const sheets = made.sheets.map((s, i) =>
    sheetFromJson({ ...s, tabId: `t${i}`, rev: 0, createdAt: i, updatedAt: i, updatedBy: BY }),
  );
  return { sheets, losses: [...read.losses, ...made.losses] };
}

const byPosition = (sheets: Sheet[]) => workbookFileFor(sheets, record).sheets[0]!.validations;

describe('every criterion through a file', () => {
  it.each(['xlsx', 'ods', 'fods'] as WorkbookFormat[])(
    'reads back the same rules from %s',
    async (format) => {
      const sheets = workbook();
      const written = writeWorkbook(sheets, record, 'Rules', format);
      const again = await reopened(written.data);
      expect(byPosition(again.sheets)).toEqual(byPosition(sheets));
      expect(byPosition(again.sheets)).toHaveLength(21);
      expect(again.losses).toEqual([]);
    },
  );

  it('reads a rule another app changed as that app left it, LiveDoc’s dropped and named', async () => {
    const written = new TextDecoder().decode(
      writeWorkbook(workbook(), record, 'Rules', 'fods').data,
    );
    const from = 'of:cell-content-is-in-list(&quot;To Do&quot;;&quot;Done&quot;)';
    expect(written).toContain(from);
    const changed = written.replace(
      from,
      'of:cell-content-is-in-list(&quot;To Do&quot;;&quot;Done&quot;;&quot;Later&quot;)',
    );
    const again = await reopened(new TextEncoder().encode(changed));
    const rules = byPosition(again.sheets)!;
    expect(rules[0]).toEqual({
      ranges: [{ r1: 1, c1: 0, r2: 5, c2: 0 }],
      is: 'list',
      opts: [{ v: 'To Do' }, { v: 'Done' }, { v: 'Later' }],
      help: 'Pick',
    });
    expect(rules.slice(1)).toEqual(byPosition(workbook())!.slice(1));
    expect(again.losses).toEqual([{ k: 'validation_rule_changed', sheet: 'One', r: 1, c: 0 }]);
  });
});
