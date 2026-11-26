// docs/specs/029-sheets/grid-and-editing.md "Clipboard": Paste Special's items (D142, D143, D144).
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { applySheetWrite, type SheetWrite } from './store';
import { clipFromRange } from './clipboard';
import type { PastedCell } from './clipboard-read';
import { pasteClip, pasteExternal, turnRows } from './commands-paste';
import { pasteClipLayout } from './paste-layout';
import { compileFormula } from './formula/stored';
import { colWidth } from './layout';
import { inputAsText } from './typed-input';
import { cellKey, type CellFormat, type FormatRule, type ValidationRule } from './sheet';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };
const seeded = () => {
  let s = 5;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

function setup(cells: Record<string, string>) {
  const b = book(cells, { rows: 10, cols: 6 });
  const id = b.sheets[0]!.id;
  const apply = (w: SheetWrite) => {
    const r = applySheetWrite(b.sheets[0]!, w, ctx);
    b.sheets[0] = r.sheet;
    b.wb.updateSheet(r.sheet, w.kind === 'cells' ? r.touched : undefined);
  };
  const layout = () => b.sheets[0]!.layout;
  const cell = (r: number, c: number) =>
    b.sheets[0]!.cells.get(cellKey(layout().rows[r]!, layout().cols[c]!));
  const text = (r: number, c: number) => inputAsText(cell(r, c)?.input, b.wb.ctxFor(id), 'en-GB');
  const format = (r: number, c: number, f: CellFormat) =>
    apply({ kind: 'cells', cells: [{ r: layout().rows[r]!, c: layout().cols[c]!, f }] });
  return { b, id, apply, layout, cell, text, format };
}

const BORDER = { w: 1, s: 'solid', c: '#000000' } as const;

describe('Paste Special, the cells', () => {
  it('replaces the pasted cells’ formats, never adds to them', () => {
    const t = setup({ A1: 'x', B1: 'y' });
    t.format(0, 0, { b: true });
    t.format(0, 1, { i: true });
    t.format(0, 2, { i: true });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 0, c2: 0 })!;
    t.apply(pasteClip(t.b.wb, t.id, { r1: 0, c1: 1, r2: 0, c2: 1 }, clip, 'all')!.edits[0]!.write);
    expect(t.cell(0, 1)?.format).toEqual({ b: true });
    t.apply(
      pasteExternal(t.b.wb, t.id, { r1: 0, c1: 2, r2: 0, c2: 2 }, [['z']], 'all')!.edits[0]!.write,
    );
    expect(t.cell(0, 2)?.format).toBeUndefined();
  });

  it('Formula Only pastes the inputs, formulas shifted, and no formats', () => {
    const t = setup({ A1: '1', B1: '=A1*2' });
    t.format(0, 1, { b: true });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 0, c2: 1 })!;
    t.apply(
      pasteClip(t.b.wb, t.id, { r1: 4, c1: 0, r2: 4, c2: 0 }, clip, 'formulas')!.edits[0]!.write,
    );
    expect(t.text(4, 1)).toBe('=A5*2');
    expect(t.cell(4, 1)?.format).toBeUndefined();
  });

  it('Transposed turns rows into columns once, each formula shifted by where it lands (D142)', () => {
    const t = setup({ A1: '1', B1: '2', A2: '3', B2: '=A1+1' });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 1, c2: 1 })!;
    // A selection four rows tall is never filled by repeats.
    const p = pasteClip(t.b.wb, t.id, { r1: 0, c1: 3, r2: 3, c2: 3 }, clip, 'transposed')!;
    t.apply(p.edits[0]!.write);
    expect([t.text(0, 3), t.text(0, 4), t.text(1, 3), t.text(1, 4)]).toEqual([
      '1',
      '3',
      '2',
      '=D1+1',
    ]);
    expect(t.cell(2, 3)).toBeUndefined();
    expect(p.range).toEqual({ r1: 0, c1: 3, r2: 1, c2: 4 });
  });

  it('All Except Borders keeps the pasted cells’ own borders', () => {
    const t = setup({ A1: 'x', C1: 'y' });
    t.format(0, 0, { b: true, bt: BORDER });
    t.format(0, 2, { bb: BORDER, i: true });
    t.format(0, 3, { bl: BORDER });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 0, c2: 1 })!;
    t.apply(
      pasteClip(t.b.wb, t.id, { r1: 0, c1: 2, r2: 0, c2: 2 }, clip, 'noBorders')!.edits[0]!.write,
    );
    expect(t.cell(0, 2)?.format).toEqual({ b: true, bb: BORDER });
    expect(t.text(0, 2)).toBe('x');
    // B1 had no format: D1 keeps only its own border.
    expect(t.cell(0, 3)?.format).toEqual({ bl: BORDER });
  });

  it('reads text from elsewhere: Formula Only without formats, Transposed turned', () => {
    const t = setup({});
    const html: PastedCell[][] = [[{ text: '5', format: { b: true } }]];
    t.apply(
      pasteExternal(t.b.wb, t.id, { r1: 0, c1: 0, r2: 0, c2: 0 }, html, 'formulas')!.edits[0]!
        .write,
    );
    expect(t.text(0, 0)).toBe('5');
    expect(t.cell(0, 0)?.format).toBeUndefined();
    const rows = [
      ['a', 'b', 'c'],
      ['d', 'e'],
    ];
    const p = pasteExternal(t.b.wb, t.id, { r1: 2, c1: 0, r2: 9, c2: 0 }, rows, 'transposed')!;
    t.apply(p.edits[0]!.write);
    expect([t.text(2, 0), t.text(2, 1), t.text(3, 0), t.text(3, 1), t.text(4, 0)]).toEqual([
      'a',
      'd',
      'b',
      'e',
      'c',
    ]);
    expect(p.range).toEqual({ r1: 2, c1: 0, r2: 4, c2: 1 });
    t.apply(
      pasteExternal(t.b.wb, t.id, { r1: 0, c1: 5, r2: 0, c2: 5 }, html, 'noBorders')!.edits[0]!
        .write,
    );
    expect(t.cell(0, 5)?.format).toEqual({ b: true });
  });

  it('turns ragged rows, a short row’s missing cells empty', () => {
    expect(turnRows([['a', 'b'], ['c']])).toEqual([
      ['a', 'c'],
      ['b', ''],
    ]);
  });
});

describe('Paste Special, the layout', () => {
  it('Column Widths Only sets each pasted column to its copied width, cut at the grid', () => {
    const t = setup({});
    t.apply({
      kind: 'layout',
      changes: [{ k: 'size', axis: 'c', ids: [t.layout().cols[0]!], px: 150 }],
    });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 0, c2: 1 })!;
    expect(clip.widths).toEqual([150, colWidth(t.layout(), t.layout().cols[1]!)]);
    t.apply(pasteClipLayout(t.b.wb, t.id, { r: 0, c: 5 }, clip, 'widths')!.edits[0]!.write);
    expect(colWidth(t.layout(), t.layout().cols[5]!)).toBe(150);
    expect(t.layout().cols).toHaveLength(6);
  });

  it('Conditional Formatting Only sets the copied rules again, cut to the copy, the formula shifted (D143)', () => {
    const t = setup({});
    const L = t.layout();
    const fx = compileFormula('=$B1>10', t.b.wb.ctxFor(t.id));
    if (!fx.ok) throw new Error('compile');
    const rule: FormatRule = {
      id: 'rule01',
      r1: L.rows[0]!,
      c1: L.cols[0]!,
      r2: L.rows[3]!,
      c2: L.cols[0]!,
      is: 'when',
      op: 'formula',
      fx: fx.formula,
      style: { bg: '#00ff00' },
    };
    const outside: FormatRule = {
      ...rule,
      id: 'rule02',
      r1: L.rows[8]!,
      r2: L.rows[9]!,
      op: 'empty',
    };
    delete outside.fx;
    const plain: FormatRule = { ...outside, id: 'rule04', r1: L.rows[4]!, r2: L.rows[4]! };
    // A rule whose corner row is gone is passed over.
    const gone: FormatRule = { ...outside, id: 'rule05', r1: 'nowhere' };
    t.apply({
      kind: 'layout',
      changes: [
        { k: 'frule', id: rule.id, rule },
        { k: 'frule', id: outside.id, rule: outside },
        { k: 'frule', id: plain.id, rule: plain },
        { k: 'frule', id: gone.id, rule: gone },
      ],
    });
    // Rows 3 to 5 copied: the rule's rows 3 and 4 only, and the plain rule on row 5.
    const clip = clipFromRange(t.b.wb, t.id, { r1: 2, c1: 0, r2: 4, c2: 0 })!;
    expect(clip.rules?.f).toHaveLength(2);
    const p = pasteClipLayout(t.b.wb, t.id, { r: 5, c: 2 }, clip, 'formatRules', seeded())!;
    t.apply(p.edits[0]!.write);
    const pasted = t.layout().formatRules!.at(-2)!;
    expect(pasted.id).not.toBe('rule01');
    expect(t.layout().formatRules!.at(-1)!.fx).toBeUndefined();
    expect([pasted.r1, pasted.c1, pasted.r2, pasted.c2]).toEqual([
      L.rows[5],
      L.cols[2],
      L.rows[6],
      L.cols[2],
    ]);
    // Written for its corner C6, moved from A3 (the copy's first row of the rule): $B3 reads $B6.
    expect(inputAsText({ f: pasted.fx! }, t.b.wb.ctxFor(t.id), 'en-GB')).toBe('=$B6>10');
  });

  it('Data Validation Only sets the copied rules again, a dropdown’s source range kept (D143)', () => {
    const t = setup({});
    const L = t.layout();
    const src = { r1: L.rows[0]!, c1: L.cols[5]!, r2: L.rows[3]!, c2: L.cols[5]! };
    const rule: ValidationRule = {
      id: 'rule03',
      r1: L.rows[0]!,
      c1: L.cols[0]!,
      r2: L.rows[1]!,
      c2: L.cols[0]!,
      is: 'list',
      src,
    };
    t.apply({ kind: 'layout', changes: [{ k: 'vrule', id: rule.id, rule }] });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 1, c2: 0 })!;
    t.apply(
      pasteClipLayout(t.b.wb, t.id, { r: 8, c: 1 }, clip, 'validation', seeded())!.edits[0]!.write,
    );
    const pasted = t.layout().rules!.at(-1)!;
    expect([pasted.r1, pasted.r2, pasted.c1]).toEqual([L.rows[8], L.rows[9], L.cols[1]]);
    expect(pasted.src).toEqual(src);
    // At the last row: cut at the grid's edge.
    const cut = pasteClipLayout(t.b.wb, t.id, { r: 9, c: 2 }, clip, 'validation', seeded())!;
    t.apply(cut.edits[0]!.write);
    const last = t.layout().rules!.at(-1)!;
    expect([last.r1, last.r2]).toEqual([L.rows[9], L.rows[9]]);
    // Wholly past the grid: nothing.
    expect(pasteClipLayout(t.b.wb, t.id, { r: 10, c: 0 }, clip, 'validation')).toBeNull();
  });

  it('Data Validation Only moves a custom formula to the pasted corner', () => {
    const t = setup({});
    const L = t.layout();
    const fx = compileFormula('=$B1>10', t.b.wb.ctxFor(t.id));
    if (!fx.ok) throw new Error('compile');
    const rule: ValidationRule = {
      id: 'rule06',
      r1: L.rows[0]!,
      c1: L.cols[0]!,
      r2: L.rows[3]!,
      c2: L.cols[0]!,
      is: 'formula',
      fx: fx.formula,
    };
    t.apply({ kind: 'layout', changes: [{ k: 'vrule', id: rule.id, rule }] });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 2, c1: 0, r2: 3, c2: 0 })!;
    t.apply(
      pasteClipLayout(t.b.wb, t.id, { r: 5, c: 2 }, clip, 'validation', seeded())!.edits[0]!.write,
    );
    const pasted = t.layout().rules!.at(-1)!;
    expect(inputAsText({ f: pasted.fx! }, t.b.wb.ctxFor(t.id), 'en-GB')).toBe('=$B6>10');
  });

  it('pastes nothing from a clip that holds none, or past the grid, or to no sheet', () => {
    const t = setup({ A1: '1' });
    const clip = clipFromRange(t.b.wb, t.id, { r1: 0, c1: 0, r2: 0, c2: 0 })!;
    const { widths: _w, rules: _r, ...old } = clip;
    expect(pasteClipLayout(t.b.wb, t.id, { r: 0, c: 0 }, old, 'widths')).toBeNull();
    expect(pasteClipLayout(t.b.wb, t.id, { r: 0, c: 0 }, old, 'formatRules')).toBeNull();
    expect(pasteClipLayout(t.b.wb, t.id, { r: 0, c: 0 }, clip, 'validation')).toBeNull();
    expect(pasteClipLayout(t.b.wb, t.id, { r: 0, c: 9 }, clip, 'widths')).toBeNull();
    expect(pasteClipLayout(t.b.wb, 'nope', { r: 0, c: 0 }, clip, 'widths')).toBeNull();
  });
});
