// A plain paste of the sheet's own cells carries their rules (grid-and-editing.md "Clipboard", D155).
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { applySheetWrite, type SheetWrite } from './store';
import { clipFromRange } from './clipboard';
import { cutRuleRemovals, pasteWithRules } from './paste-layout';
import { posRangeOf } from './layout';
import type { FormatRule, ValidationRule } from './sheet';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };

function setup() {
  const b = book({ A1: '1', A2: '2' }, { rows: 10, cols: 6 });
  const id = b.sheets[0]!.id;
  const apply = (w: SheetWrite, sheet = 0) => {
    const r = applySheetWrite(b.sheets[sheet]!, w, ctx);
    b.sheets[sheet] = r.sheet;
    b.wb.updateSheet(r.sheet, w.kind === 'cells' ? r.touched : undefined);
  };
  const L = b.sheets[0]!.layout;
  const frule: FormatRule = {
    id: 'fr01',
    r1: L.rows[0]!,
    c1: L.cols[0]!,
    r2: L.rows[1]!,
    c2: L.cols[0]!,
    is: 'when',
    op: 'empty',
    style: { bg: '#00ff00' },
  };
  const wide: FormatRule = { ...frule, id: 'fr02', r2: L.rows[5]! };
  const vrule: ValidationRule = {
    id: 'vr01',
    r1: L.rows[0]!,
    c1: L.cols[0]!,
    r2: L.rows[0]!,
    c2: L.cols[0]!,
    is: 'check',
  };
  apply({
    kind: 'layout',
    changes: [
      { k: 'frule', id: frule.id, rule: frule },
      { k: 'frule', id: wide.id, rule: wide },
      { k: 'vrule', id: vrule.id, rule: vrule },
    ],
  });
  const layout = () => b.sheets[0]!.layout;
  const where = (
    rules: readonly { r1: string; c1: string; r2: string; c2: string }[] | undefined,
  ) => (rules ?? []).map((x) => posRangeOf(layout(), x));
  const run = (sel: { r1: number; c1: number; r2: number; c2: number }, cut: boolean) => {
    const clip = clipFromRange(b.wb, id, { r1: 0, c1: 0, r2: 1, c2: 0 }, cut)!;
    const res = pasteWithRules(b.wb, id, sel, clip)!;
    for (const e of res.edits) apply(e.write);
    return res;
  };
  return { b, id, layout, where, run };
}

describe('pasteWithRules', () => {
  it('a copy sets the rules over the copied cells again over the pasted ones', () => {
    const t = setup();
    t.run({ r1: 0, c1: 2, r2: 0, c2: 2 }, false);
    expect(t.b.v('C1')).toBe(1);
    expect(t.where(t.layout().formatRules)).toEqual([
      { r1: 0, c1: 0, r2: 1, c2: 0 },
      { r1: 0, c1: 0, r2: 5, c2: 0 },
      { r1: 0, c1: 2, r2: 1, c2: 2 },
      { r1: 0, c1: 2, r2: 1, c2: 2 },
    ]);
    expect(t.where(t.layout().rules)).toEqual([
      { r1: 0, c1: 0, r2: 0, c2: 0 },
      { r1: 0, c1: 2, r2: 0, c2: 2 },
    ]);
  });

  it('a cut takes the rules wholly over its cells from their old place', () => {
    const t = setup();
    t.run({ r1: 0, c1: 3, r2: 0, c2: 3 }, true);
    expect(t.b.v('A1')).toBeNull();
    expect(t.where(t.layout().formatRules)).toEqual([
      { r1: 0, c1: 0, r2: 5, c2: 0 },
      { r1: 0, c1: 3, r2: 1, c2: 3 },
      { r1: 0, c1: 3, r2: 1, c2: 3 },
    ]);
    expect(t.where(t.layout().rules)).toEqual([{ r1: 0, c1: 3, r2: 0, c2: 3 }]);
  });

  it('pastes cells alone when no rule is near, and nothing on an unknown sheet', () => {
    const b = book({ A1: 'x' }, { rows: 5, cols: 5 });
    const id = b.sheets[0]!.id;
    const clip = clipFromRange(b.wb, id, { r1: 0, c1: 0, r2: 0, c2: 0 }, true)!;
    expect(pasteWithRules(b.wb, id, { r1: 1, c1: 1, r2: 1, c2: 1 }, clip)!.edits).toHaveLength(1);
    expect(pasteWithRules(b.wb, 'nope', { r1: 1, c1: 1, r2: 1, c2: 1 }, clip)).toBeNull();
    const gone = { ...clip, from: { ...clip.from, sheetId: 'gone' } };
    expect(
      pasteWithRules(b.wb, id, { r1: 1, c1: 1, r2: 1, c2: 1 }, { ...gone, cut: undefined }),
    ).not.toBeNull();
    expect(cutRuleRemovals(b.sheets[0]!.layout, { r1: 0, c1: 0, r2: 4, c2: 4 })).toEqual([]);
  });
});
