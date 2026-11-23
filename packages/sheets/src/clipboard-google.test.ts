// The clipboard with Google Sheets and Excel (grid-and-editing.md "Clipboard", D152 to D154): a copy written as
// Google writes it, and a paste reading formulas and merges back.
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { applySheetWrite, type SheetWrite } from './store';
import { clipFromRange } from './clipboard';
import { clipToHtml, styleOf } from './clipboard-html';
import { readPastedHtml } from './clipboard-read';
import { pasteExternal } from './commands-paste';
import { idRangeOf, posRangeOf } from './layout';
import { cellKey } from './sheet';
import { inputAsText } from './typed-input';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };

function setup(cells: Record<string, string>) {
  const b = book(cells, { rows: 10, cols: 6 });
  const id = b.sheets[0]!.id;
  const apply = (w: SheetWrite) => {
    const r = applySheetWrite(b.sheets[0]!, w, ctx);
    b.sheets[0] = r.sheet;
    b.wb.updateSheet(r.sheet, w.kind === 'cells' ? r.touched : undefined);
  };
  const layout = () => b.sheets[0]!.layout;
  const merge = (r1: number, c1: number, r2: number, c2: number) =>
    apply({
      kind: 'layout',
      changes: [
        { k: 'merges', merges: [...(layout().merges ?? []), idRangeOf(layout(), r1, c1, r2, c2)!] },
      ],
    });
  const merges = () => (layout().merges ?? []).map((m) => posRangeOf(layout(), m));
  const text = (r: number, c: number) =>
    inputAsText(
      b.sheets[0]!.cells.get(cellKey(layout().rows[r]!, layout().cols[c]!))?.input,
      b.wb.ctxFor(id),
      'en-GB',
    );
  return { b, id, apply, merge, merges, text };
}

describe('a copy as Google writes it', () => {
  it('spans a merge, leaves its covered cells out, and carries formulas as R1C1', () => {
    const t = setup({ A1: 'wide', C1: '=A1&"!"', A2: '1', B2: '=$A$2+A2' });
    t.merge(0, 0, 0, 1);
    const html = clipToHtml(clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 1, c2: 2 })!);
    expect(html).toContain(
      '<tr><td colspan="2">wide</td><td data-sheets-formula="=R[0]C[-2]&amp;&quot;!&quot;">',
    );
    expect(html).toContain('<td data-sheets-formula="=R2C1+R[0]C[-1]">2</td>');
    t.merge(4, 0, 5, 0);
    const tall = clipToHtml(clipFromRange(t.b.wb, t.id, { r1: 4, c1: 0, r2: 5, c2: 0 })!);
    expect(tall).toContain('<tr><td rowspan="2"></td></tr><tr></tr>');
    // A merge reaching outside the copy is written as plain cells.
    expect(clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 0, c2: 0 })!.merges).toBeUndefined();
  });

  it('writes vertical alignment and borders inline', () => {
    expect(styleOf({ va: 't', bl: { w: 2, s: 'dashed', c: '#123456' } })).toBe(
      ' style="vertical-align:top;border-left:2px dashed #123456"',
    );
    expect(styleOf({ va: 'm' })).toBe(' style="vertical-align:middle"');
    expect(styleOf({ va: 'b' })).toBe(' style="vertical-align:bottom"');
  });
});

describe('a paste of Google’s HTML', () => {
  const sel = (r: number, c: number) => ({ r1: r, c1: c, r2: r, c2: c });
  const google = (cells: string) => readPastedHtml(`<table><tr>${cells}</tr></table>`)!;

  it('reads formulas where they land, and their value when one cannot be read', () => {
    const t = setup({ A3: '5' });
    const rows = google(
      '<td>5</td><td data-sheets-formula="=R[0]C[-1]*2">10</td><td data-sheets-formula="=R[-9]C[0]">7</td>',
    );
    t.apply(pasteExternal(t.b.wb, t.id, sel(2, 0), rows, 'all')!.edits[0]!.write);
    expect([t.text(2, 1), t.b.v('B3'), t.text(2, 2)]).toEqual(['=A3*2', 10, '7']);
    // Values Only takes the values.
    t.apply(pasteExternal(t.b.wb, t.id, sel(4, 0), rows, 'values')!.edits[0]!.write);
    expect(t.text(4, 1)).toBe('10');
    // A formula that cannot be read pastes its value.
    const broken = google('<td data-sheets-formula="=SUM(">3</td>');
    t.apply(pasteExternal(t.b.wb, t.id, sel(6, 0), broken, 'all')!.edits[0]!.write);
    expect(t.text(6, 0)).toBe('3');
  });

  it('merges spanning cells for an Editor, never across a merge, and not when asked not to', () => {
    const t = setup({});
    const rows = readPastedHtml(
      '<table><tr><td colspan="2">a</td><td rowspan="3">b</td></tr><tr><td>c</td><td>d</td></tr></table>',
    )!;
    expect(pasteExternal(t.b.wb, t.id, sel(0, 0), rows, 'all')!.edits[0]!.write.kind).toBe('cells');
    t.merge(1, 2, 1, 3);
    t.apply(pasteExternal(t.b.wb, t.id, sel(0, 0), rows, 'all', { merges: true })!.edits[0]!.write);
    // The tall span crosses C2:D2 and is left out; it is cut to the pasted box anyway.
    expect(t.merges()).toEqual([
      { r1: 1, c1: 2, r2: 1, c2: 3 },
      { r1: 0, c1: 0, r2: 0, c2: 1 },
    ]);
    const formats = pasteExternal(t.b.wb, t.id, sel(5, 0), rows, 'values', { merges: true })!;
    expect(formats.edits[0]!.write.kind).toBe('cells');
    // A span repeated by tiling: two spans side by side, the one at the grid's edge cut to a single cell.
    const tiled = pasteExternal(
      t.b.wb,
      t.id,
      { r1: 8, c1: 3, r2: 8, c2: 5 },
      google('<td colspan="2">x</td>'),
      'all',
      {
        merges: true,
      },
    )!;
    const w = tiled.edits[0]!.write;
    expect(w.kind === 'layout' ? w.changes.at(-1) : null).toMatchObject({ k: 'merges' });
  });

  it('merges on a sheet with none, past a merge whose lines are gone, and never from text', () => {
    const t = setup({});
    const rows = google('<td colspan="2">a</td>');
    t.apply(pasteExternal(t.b.wb, t.id, sel(0, 0), rows, 'all', { merges: true })!.edits[0]!.write);
    expect(t.merges()).toEqual([{ r1: 0, c1: 0, r2: 0, c2: 1 }]);
    const s0 = t.b.sheets[0]!;
    const stale = { r1: 'gone', c1: 'gone', r2: 'gone', c2: 'gone' };
    t.b.wb.updateSheet({ ...s0, layout: { ...s0.layout, merges: [stale] } });
    const w = pasteExternal(t.b.wb, t.id, sel(3, 0), rows, 'all', { merges: true })!.edits[0]!
      .write;
    expect(w.kind === 'layout' ? w.changes : null).toEqual([
      { k: 'merges', merges: [stale, { r1: 's0r3', c1: 's0c0', r2: 's0r3', c2: 's0c1' }] },
    ]);
    expect(
      pasteExternal(t.b.wb, t.id, sel(5, 0), [['a', 'b']], 'all', { merges: true })!.edits[0]!.write
        .kind,
    ).toBe('cells');
  });
});

describe('styleOf and a copy past the grid', () => {
  it('writes each alignment, nothing for no formats, and empty cells past the edge', () => {
    expect([styleOf({ ha: 'l' }), styleOf({ ha: 'c' }), styleOf({ ha: 'r' }), styleOf({})]).toEqual(
      [' style="text-align:left"', ' style="text-align:center"', ' style="text-align:right"', ''],
    );
    const t = setup({ F10: 'edge' });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 9, c1: 5, r2: 10, c2: 6 })!;
    expect(clip.cells).toEqual([
      [expect.objectContaining({}), null],
      [null, null],
    ]);
  });
});
