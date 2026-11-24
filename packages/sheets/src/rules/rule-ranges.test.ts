// A format rule's several rectangles (docs/specs/029-sheets/conditional-formatting.md "Rules", D214): drawing, colour
// scales, custom formulas, deletions, validation, the clipboard, and the range's text. Also the formula's reach:
// other sheets and named ranges.
import { describe, expect, it } from 'vitest';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { validateWrite } from '../validate';
import { compileFormula } from '../formula/stored';
import { book, makeSheets } from '../testing/book';
import { clipLayoutOf, cutRuleRemovals, pasteClipLayout } from '../paste-layout';
import { FORMAT_RULE_RANGES_MAX } from '../limits';
import type { SheetClip } from '../clipboard';
import type { FormatRule, IdRange, Sheet } from '../sheet';
import type { Value } from '../formula/values';
import { formatRuleStyle, formatRulesAt, mixColour } from './format-rules';
import { ruleRangeText, parseRuleRangeText, ruleRectangles, ruleTouches } from './rule-ranges';

const shownOf = (v: Value): string =>
  typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? String(v) : '';
const by = { id: 'p', name: 'P', color: '#000000' };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const apply = (s: Sheet, w: SheetWrite) => applySheetWrite(s, w, { now: 1, by }).sheet;
const box = (r1: number, c1: number, r2: number, c2: number): IdRange => ({
  r1: R(r1),
  c1: C(c1),
  r2: R(r2),
  c2: C(c2),
});
// A1:A3 and C2:C4 by default.
const fr = (x: Partial<FormatRule>, also: IdRange[] = [box(1, 2, 3, 2)]): FormatRule => ({
  id: 'frule1',
  ...box(0, 0, 2, 0),
  also,
  is: 'when',
  ...x,
});
const set = (rule: FormatRule): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'frule', id: rule.id, rule }],
});
const RED = { bg: '#f4c7c3' };

function ruled(cells: Record<string, string>, rules: FormatRule[]) {
  const b = book(cells, { rows: 10, cols: 4 });
  let sheet = b.sheets[0]!;
  for (const r of rules) sheet = apply(sheet, set(r));
  b.sheets[0] = sheet;
  b.wb.updateSheet(sheet);
  const style = (r: number, c = 0) => {
    const v = b.wb.value(sheet.id, r, c);
    return formatRuleStyle(b.wb, sheet.id, r, c, v, shownOf(v));
  };
  return { b, sheet, style };
}

describe('a rule of several rectangles', () => {
  it('draws every rectangle, and a cell in two of them lists the rule once', () => {
    const { sheet, style } = ruled({ A1: '5', C2: '5', C4: '5', B2: '5' }, [
      fr({ op: 'notEmpty', style: RED }, [box(1, 2, 3, 2), box(0, 0, 1, 0)]),
    ]);
    expect([style(0), style(1, 2), style(3, 2)]).toEqual([RED, RED, RED]);
    expect(style(1, 1)).toBeNull();
    expect(formatRulesAt(sheet.layout, 0, 0)).toHaveLength(1);
  });
  it('shades a colour scale across every rectangle, each cell counted once', () => {
    const { style } = ruled({ A1: '0', A2: '10', C4: '20' }, [
      fr(
        {
          is: 'scale',
          min: { c: '#ffffff', at: 'min' },
          max: { c: '#000000', at: 'pctile', v: 50 },
        },
        [box(3, 2, 3, 2), box(0, 0, 1, 0)],
      ),
    ]);
    // Numbers 0, 10, 20 (A1 and A2 once though two rectangles hold them): the median is 10.
    expect(style(1)).toEqual({ bg: '#000000' });
    expect(style(0)).toEqual({ bg: '#ffffff' });
    expect(style(3, 2)).toEqual({ bg: '#000000' });
    const half = ruled({ A1: '0', C4: '20' }, [
      fr({ is: 'scale', min: { c: '#ffffff', at: 'min' }, max: { c: '#000000', at: 'max' } }, [
        box(3, 2, 3, 2),
      ]),
    ]);
    expect(half.style(0)).toEqual({ bg: '#ffffff' });
    expect(half.style(3, 2)).toEqual({ bg: '#000000' });
    expect(mixColour('#ffffff', '#000000', 0)).toBe('#ffffff');
  });
  it('reads a custom formula from the anchor, moved up or left for a later rectangle', () => {
    const b0 = book({}, { rows: 10, cols: 4 });
    // Written for C3, the anchor's top-left; A1, two rows up, reads $D1.
    const fx = compileFormula('=$D3>10', b0.wb.ctxFor(b0.sheets[0]!.id));
    if (!fx.ok) throw new Error('compile');
    const { style } = ruled({ D1: '20', D2: '5', D3: '20', D4: '5' }, [
      {
        id: 'frule1',
        ...box(2, 2, 3, 2),
        also: [box(0, 0, 1, 0)],
        is: 'when',
        op: 'formula',
        fx: fx.formula,
        style: RED,
      },
    ]);
    expect([style(2, 2), style(3, 2)]).toEqual([RED, null]);
    expect([style(0), style(1)]).toEqual([RED, null]);
  });
});

describe('deleting rows and columns', () => {
  const base = makeSheets({ 'Sheet 1': {} }, { rows: 10, cols: 4 })[0]!;
  it('shrinks each rectangle and drops one whose cells all went, undone', () => {
    const rule = fr({ op: 'empty', style: RED }, [box(5, 2, 5, 2), box(6, 1, 7, 1)]);
    const s = apply(base, set(rule));
    const del = applySheetWrite(
      s,
      { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(5), R(6)] }] },
      { now: 1, by },
    );
    expect(del.sheet.layout.formatRules![0]!.also).toEqual([box(7, 1, 7, 1)]);
    expect(apply(del.sheet, inverseSheetWrite(s, del)).layout.formatRules).toEqual(
      s.layout.formatRules,
    );
    const lastGone = apply(s, {
      kind: 'layout',
      changes: [{ k: 'deleteRows', ids: [R(5), R(6), R(7)] }],
    });
    expect(lastGone.layout.formatRules![0]!.also).toBeUndefined();
  });
  it('makes the next rectangle the anchor when the anchor goes, its formula moved there', () => {
    const b0 = book({}, { rows: 10, cols: 4 });
    const fx = compileFormula('=$D1>10', b0.wb.ctxFor(b0.sheets[0]!.id));
    if (!fx.ok) throw new Error('compile');
    const rule: FormatRule = {
      id: 'frule1',
      ...box(0, 0, 0, 0),
      also: [box(4, 2, 5, 2), box(7, 0, 7, 0)],
      is: 'when',
      op: 'formula',
      fx: fx.formula,
      style: RED,
    };
    const after = apply(apply(base, set(rule)), {
      kind: 'layout',
      changes: [{ k: 'deleteRows', ids: [R(0)] }],
    });
    const moved = after.layout.formatRules![0]!;
    expect(ruleRectangles(moved)).toEqual([box(4, 2, 5, 2), box(7, 0, 7, 0)]);
    // Written for C5 now: the old $D5, as C5 read it before.
    expect(moved.fx!.r.map((x) => x.r1)).toEqual([R(4)]);
    const gone = apply(apply(base, set(rule)), {
      kind: 'layout',
      changes: [{ k: 'deleteRows', ids: [R(0), R(4), R(5), R(7)] }],
    });
    expect(gone.layout.formatRules).toBeUndefined();
  });
});

describe('what several rectangles may be', () => {
  const base = makeSheets({ 'Sheet 1': {} }, { rows: 10, cols: 4 })[0]!;
  const ok = (also: unknown) =>
    validateWrite(base, set({ ...fr({ op: 'empty', style: RED }), also: also as IdRange[] })).ok;
  it('takes rectangles on the sheet, up to the limit with the anchor', () => {
    expect(ok([box(1, 1, 2, 2)])).toBe(true);
    expect(ok(Array.from({ length: FORMAT_RULE_RANGES_MAX - 1 }, () => box(1, 1, 1, 1)))).toBe(
      true,
    );
    expect(ok(Array.from({ length: FORMAT_RULE_RANGES_MAX }, () => box(1, 1, 1, 1)))).toBe(false);
    expect(ok([])).toBe(false);
    expect(ok([{ ...box(1, 1, 1, 1), r2: 'nope00' }])).toBe(false);
    expect(ok(box(1, 1, 1, 1))).toBe(false);
  });
});

describe('the clipboard', () => {
  const clipOf = (s: Sheet, r1: number, c1: number, r2: number, c2: number): SheetClip =>
    ({
      from: { sheetId: s.id, r: r1, c: c1 },
      rows: r2 - r1 + 1,
      cols: c2 - c1 + 1,
      cells: [],
      ...clipLayoutOf(s.layout, { r1, c1, r2, c2 }),
    }) as unknown as SheetClip;
  it('pastes the pieces over the copy as one rule, its formula moved with the first piece', () => {
    const b = book({}, { rows: 10, cols: 4 });
    const fx = compileFormula('=$D1>10', b.wb.ctxFor(b.sheets[0]!.id));
    if (!fx.ok) throw new Error('compile');
    let s = b.sheets[0]!;
    // A1:A3 (anchor) and C2:C4; the copy is B2:C3.
    s = apply(s, set(fr({ op: 'formula', fx: fx.formula, style: RED })));
    b.wb.updateSheet(s);
    const copied = clipOf(s, 1, 0, 2, 2);
    const pasted = pasteClipLayout(b.wb, s.id, { r: 5, c: 0 }, copied, 'formatRules', () => 0.5)!;
    const [change] = (pasted.edits[0]!.write as { changes: { rule: FormatRule }[] }).changes;
    const rule = change!.rule;
    expect(ruleRectangles(rule)).toEqual([box(5, 0, 6, 0), box(5, 2, 6, 2)]);
    // A2's piece is the anchor now: written for A6, A2's $D2 moved four rows to $D6.
    expect(rule.fx!.r[0]!.r1).toBe(R(5));
  });
  it('a cut takes a rule only when every rectangle lies inside it', () => {
    const s = apply(
      makeSheets({ 'Sheet 1': {} }, { rows: 10, cols: 4 })[0]!,
      set(fr({ op: 'empty', style: RED })),
    );
    expect(cutRuleRemovals(s.layout, { r1: 0, c1: 0, r2: 3, c2: 2 })).toHaveLength(1);
    expect(cutRuleRemovals(s.layout, { r1: 0, c1: 0, r2: 2, c2: 2 })).toHaveLength(0);
  });
});

describe('the range as text', () => {
  const layout = makeSheets({ 'Sheet 1': {} }, { rows: 10, cols: 4 })[0]!.layout;
  it('prints and reads rectangles with commas', () => {
    expect(ruleRangeText(layout, fr({}))).toBe('A1:A3,C2:C4');
    expect(ruleRangeText(layout, fr({}, []))).toBe('A1:A3');
    expect(ruleRangeText(layout, { ...fr({}), also: [{ ...box(0, 0, 0, 0), r1: 'gone00' }] })).toBe(
      'A1:A3',
    );
    expect(parseRuleRangeText(' A1:A3 , C2:C4 ')).toEqual([
      { r1: 0, c1: 0, r2: 2, c2: 0 },
      { r1: 1, c1: 2, r2: 3, c2: 2 },
    ]);
    expect(parseRuleRangeText('A1:A3,')).toBeNull();
    expect(parseRuleRangeText('')).toBeNull();
    expect(
      parseRuleRangeText(
        Array(FORMAT_RULE_RANGES_MAX + 1)
          .fill('A1')
          .join(','),
      ),
    ).toBeNull();
  });
  it('touches a range when any rectangle does', () => {
    const rule = fr({});
    expect(ruleTouches(layout, rule, { r1: 3, c1: 2, r2: 3, c2: 3 })).toBe(true);
    expect(ruleTouches(layout, rule, { r1: 0, c1: 1, r2: 0, c2: 3 })).toBe(false);
  });
});

describe("a custom formula's reach", () => {
  it('reads another sheet and a named range', () => {
    const b = book({ One: { A1: '1', A2: '2' }, Two: { A1: '5', A2: '0' } }, { rows: 10, cols: 4 });
    let s = b.sheets[0]!;
    s = apply(s, {
      kind: 'layout',
      changes: [{ k: 'name', name: 'Limit', range: box(0, 0, 0, 0) }],
    });
    b.wb.updateSheet(s);
    const met = (text: string) => {
      const fx = compileFormula(text, b.wb.ctxFor(s.id));
      if (!fx.ok) throw new Error(text);
      const rule: FormatRule = {
        ...box(0, 0, 1, 0),
        id: 'frule1',
        is: 'when',
        op: 'formula',
        fx: fx.formula,
        style: RED,
      };
      expect(validateWrite(s, set(rule)).ok).toBe(true);
      const next = apply(s, set(rule));
      b.wb.updateSheet(next);
      return [0, 1].map(
        (r) => formatRuleStyle(b.wb, s.id, r, 0, b.wb.value(s.id, r, 0), '') !== null,
      );
    };
    expect(met('=Two!A1>1')).toEqual([true, false]);
    expect(met('=Two!$A$1>1')).toEqual([true, true]);
    expect(met('=A1>Limit')).toEqual([false, true]);
  });
});
