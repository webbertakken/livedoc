import { beforeEach, describe, expect, it } from 'vitest';
import type { SheetJson } from '@livedoc/sheets';
import { CellStyle } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from './workbook-test-kit';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet" (Styles), formatting.md "Styles in the model": a format that
// lands in a spreadsheet's cell becomes its style, each distinct style once by id, and reads answer the format again.

let kit: WorkbookKit;
let r0: string, r1: string, r2: string, c0: string, c1: string;

const call = (req: Parameters<WorkbookKit['call']>[0]) => kit.call(req);
const document = (id: string, spreadsheet: boolean, cells: SheetJson['cells'] = []) =>
  kit.document(id, spreadsheet, cells);
const write: WorkbookKit['write'] = (id, w) => kit.write(id, w);

const stored = (id: string) =>
  kit.sql.sql
    .prepare(
      `SELECT row_id AS r, col_id AS c, format, style_id AS style FROM sheet_cells
        WHERE sheet_id = ? ORDER BY rowid`,
    )
    .all(`${id}Sheet`)
    .map((row) => ({ ...row }));

const styles = (id: string) =>
  kit.sql.sql
    .prepare('SELECT id, keys FROM sheet_styles WHERE document_id = ? ORDER BY rowid')
    .all(id)
    .map((row) => ({ ...row }));

const cellsRead = async (id: string) => (await kit.sheets(id))[0]!.cells;

beforeEach(() => {
  kit = workbookKit();
  [r0, r1, r2] = kit.layout.rows as [string, string, string];
  [c0, c1] = kit.layout.cols as [string, string];
});

describe('styles in a spreadsheet', () => {
  it('stores each distinct format once, by id in the order its cells were written', async () => {
    await call({ path: '', body: document('book', true) });
    const res = await write('book', {
      kind: 'cells',
      cells: [
        { r: r0, c: c0, i: { n: 1 }, f: { fc: '#ff0000', b: true } },
        { r: r0, c: c1, f: { i: true } },
        { r: r1, c: c0, i: { n: 2 }, f: { b: true, fc: '#ff0000' } },
      ],
    });
    expect(res.status).toBe(200);
    expect(styles('book')).toEqual([
      { id: 's1', keys: CellStyle.keyOf({ b: true, fc: '#ff0000' }) },
      { id: 's2', keys: CellStyle.keyOf({ i: true }) },
    ]);
    expect(stored('book')).toEqual([
      { r: r0, c: c0, format: null, style: 's1' },
      { r: r1, c: c0, format: null, style: 's1' },
      // A cell of a format alone is made after the write's inputs.
      { r: r0, c: c1, format: null, style: 's2' },
    ]);
    // The write's answer and a read carry the formats, as the wire always has.
    const answered = await res.json<{ cells: SheetJson['cells'] }>();
    expect(answered.cells[2]).toEqual({ r: r1, c: c0, i: { n: 2 }, f: { b: true, fc: '#ff0000' } });
    expect(await cellsRead('book')).toEqual(
      expect.arrayContaining([{ r: r0, c: c1, f: { i: true } }]),
    );
  });

  it('merges a patch into a styled cell, finding or making the style it now has', async () => {
    await call({ path: '', body: document('book', true) });
    await write('book', {
      kind: 'cells',
      cells: [
        { r: r0, c: c0, i: { n: 1 }, f: { b: true } },
        { r: r1, c: c0, i: { n: 2 }, f: { b: true, i: true } },
      ],
    });
    await write('book', { kind: 'cells', cells: [{ r: r0, c: c0, f: { i: true } }] });
    expect(stored('book')[0]).toEqual({ r: r0, c: c0, format: null, style: 's2' });
    await write('book', { kind: 'cells', cells: [{ r: r0, c: c0, f: { b: null, u: true } }] });
    expect(styles('book').map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(await cellsRead('book')).toEqual(
      expect.arrayContaining([{ r: r0, c: c0, i: { n: 1 }, f: { i: true, u: true } }]),
    );
  });

  it('drops a cell left with no input and no style, and keeps one with its input', async () => {
    await call({ path: '', body: document('book', true) });
    await write('book', {
      kind: 'cells',
      cells: [
        { r: r0, c: c0, f: { b: true } },
        { r: r1, c: c0, i: { n: 2 }, f: { b: true } },
      ],
    });
    await write('book', {
      kind: 'cells',
      cells: [
        { r: r0, c: c0, f: null },
        { r: r1, c: c0, f: { b: null } },
      ],
    });
    expect(stored('book')).toEqual([{ r: r1, c: c0, format: null, style: null }]);
    expect(await cellsRead('book')).toEqual([{ r: r1, c: c0, i: { n: 2 } }]);
  });

  it('styles the cells a spreadsheet is made with, and counts their bytes as their formats', async () => {
    await call({
      path: '',
      body: document('book', true, [
        { r: r0, c: c0, i: { n: 1 }, f: { b: true } },
        { r: r2, c: c1, f: { b: true } },
      ]),
    });
    expect(stored('book').map((c) => c.style)).toEqual(['s1', 's1']);
    const head = kit.sql.sql
      .prepare("SELECT cell_count, cell_bytes FROM sheets WHERE id = 'bookSheet'")
      .get();
    const bytes = '{"n":1}'.length + 2 * '{"b":true}'.length;
    expect({ ...head }).toEqual({ cell_count: 2, cell_bytes: bytes });
  });

  it('gives a copied spreadsheet styles of its own', async () => {
    await call({
      path: '',
      body: document('book', true, [{ r: r0, c: c0, i: { n: 1 }, f: { u: true } }]),
    });
    const res = await call({ path: '/book/copy', body: {} });
    const { document: copied } = await res.json<{ document: { id: string } }>();
    expect(styles(copied.id)).toEqual([{ id: 's1', keys: CellStyle.keyOf({ u: true }) }]);
    const cell = kit.sql.sql
      .prepare('SELECT format, style_id AS style FROM sheet_cells WHERE document_id = ?')
      .get(copied.id);
    expect({ ...cell }).toEqual({ format: null, style: 's1' });
  });
});

describe('formats outside a spreadsheet', () => {
  it('stay on the cell, with no styles', async () => {
    await call({ path: '', body: document('plan', false) });
    await write('plan', { kind: 'cells', cells: [{ r: r0, c: c0, i: { n: 1 }, f: { b: true } }] });
    expect(stored('plan')).toEqual([{ r: r0, c: c0, format: '{"b":true}', style: null }]);
    expect(styles('plan')).toEqual([]);
  });
});
