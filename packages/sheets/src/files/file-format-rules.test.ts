// Format rules between the model and a file (docs/specs/029-sheets/standard-mapping.md "Format rules in the file",
// D215): positions, formulas in Google's syntax for the anchor, dates and Exactly as the files hold them, and the read
// rules made again on the grid, clamped, compiled and checked.
import { describe, expect, it } from 'vitest';
import { book } from '../testing/book';
import { compileFormula } from '../formula/stored';
import type { FormatRule, IdRange } from '../sheet';
import type { FileLoss } from './workbook-file';
import { fileFormatRulesOf, formatRulesFromFile, type FileFormatRule } from './file-format-rules';

const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const box = (r1: number, c1: number, r2: number, c2: number): IdRange => ({
  r1: R(r1),
  c1: C(c1),
  r2: R(r2),
  c2: C(c2),
});
const RED = { bg: '#f4c7c3' };
const rule = (x: Partial<FormatRule>): FormatRule => ({
  id: 'frule1',
  ...box(1, 0, 4, 0),
  is: 'when',
  style: RED,
  ...x,
});

function setup() {
  const b = book({ One: {}, Two: {} }, { rows: 10, cols: 4 });
  const sheet = b.sheets[0]!;
  const ctx = b.wb.ctxFor(sheet.id);
  return { b, sheet, ctx };
}

describe('the model as a file holds it', () => {
  it('writes positions, operands as numbers or text, dates and Exactly as the files hold them', () => {
    const { sheet, ctx } = setup();
    const fx = compileFormula('=Two!$B2>0', ctx);
    if (!fx.ok) throw new Error('compile');
    const rules: FormatRule[] = [
      rule({ op: 'gt', a: '10', also: [box(1, 2, 2, 2)] }),
      rule({ op: 'between', a: '1', b: '05/01/2026' }),
      rule({ op: 'eq', a: 'abc' }),
      rule({ op: 'exactly', a: '5' }),
      rule({ op: 'contains', a: 'x' }),
      rule({ op: 'empty' }),
      rule({ op: 'dateBefore', a: '2026-01-05' }),
      rule({ op: 'dateAfter', a: '2026-01-05' }),
      rule({ op: 'dateOn', a: '2026-01-05' }),
      rule({ op: 'dateOn', a: 'never' }),
      rule({ op: 'formula', fx: fx.formula }),
      rule({
        is: 'scale',
        style: undefined,
        min: { c: '#ffffff', at: 'min' },
        mid: { c: '#808080', at: 'pct', v: 50 },
        max: { c: '#000000', at: 'max' },
      }),
      { ...rule({ op: 'empty' }), r1: 'gone00' },
    ];
    const out = fileFormatRulesOf({ ...sheet.layout, formatRules: rules }, ctx, 'en-GB')!;
    expect(out[0]).toEqual({
      ranges: [
        { r1: 1, c1: 0, r2: 4, c2: 0 },
        { r1: 1, c1: 2, r2: 2, c2: 2 },
      ],
      is: 'when',
      op: 'gt',
      a: 10,
      style: RED,
    });
    expect(out.slice(1, 6).map((x) => [x.op, x.a, x.b])).toEqual([
      ['between', 1, 46027],
      ['eq', 'abc', undefined],
      ['eq', '5', undefined],
      ['contains', 'x', undefined],
      ['empty', undefined, undefined],
    ]);
    expect(out.slice(6, 10).map((x) => [x.op, x.formula])).toEqual([
      ['formula', '=AND(ISNUMBER(A2),INT(A2)<DATE(2026,1,5))'],
      ['formula', '=AND(ISNUMBER(A2),INT(A2)>DATE(2026,1,5))'],
      ['formula', '=AND(ISNUMBER(A2),INT(A2)=DATE(2026,1,5))'],
      ['formula', '=FALSE'],
    ]);
    expect(out[10]).toMatchObject({ op: 'formula', formula: '=Two!$B2>0' });
    expect(out[11]).toEqual({
      ranges: [{ r1: 1, c1: 0, r2: 4, c2: 0 }],
      is: 'scale',
      min: { c: '#ffffff', at: 'min' },
      mid: { c: '#808080', at: 'pct', v: 50 },
      max: { c: '#000000', at: 'max' },
    });
    expect(out).toHaveLength(12);
    expect(fileFormatRulesOf(sheet.layout, ctx, 'en-GB')).toBeUndefined();
  });
});

describe('a file\u2019s rules on the grid', () => {
  const read = (rules: FileFormatRule[]) => {
    const { sheet, ctx } = setup();
    const losses: FileLoss[] = [];
    let n = 0;
    const made = formatRulesFromFile(
      rules,
      sheet.layout,
      ctx,
      'One',
      () => (n++ % 97) / 97,
      losses,
    );
    return { made, losses, layout: sheet.layout };
  };
  it('makes each rule by ids, operands as text, its formula compiled for the anchor', () => {
    const { made, losses } = read([
      {
        ranges: [
          { r1: 1, c1: 0, r2: 40, c2: 0 },
          { r1: 0, c1: 2, r2: 0, c2: 9 },
        ],
        is: 'when',
        op: 'between',
        a: 1.5,
        b: 'x',
        style: RED,
      },
      {
        ranges: [{ r1: 2, c1: 1, r2: 3, c2: 1 }],
        is: 'when',
        op: 'formula',
        formula: '=$A3>Two!A1',
        style: RED,
      },
      {
        ranges: [{ r1: 0, c1: 0, r2: 0, c2: 0 }],
        is: 'scale',
        min: { c: '#ffffff', at: 'num', v: 1 },
        mid: { c: '#808080', at: 'pctile', v: 50 },
        max: { c: '#000000', at: 'max' },
      },
    ]);
    expect(losses).toEqual([]);
    expect(made![0]).toMatchObject({
      ...box(1, 0, 9, 0),
      also: [box(0, 2, 0, 3)],
      a: '1.5',
      b: 'x',
    });
    expect(made![1]!.fx!.r.map((x) => x.r1)).toEqual([R(2), 's1r0']);
    expect(made![2]).toMatchObject({ is: 'scale', min: { at: 'num', v: 1 } });
    expect(new Set(made!.map((x) => x.id)).size).toBe(3);
  });
  it('carries a two-point scale both ways', () => {
    const { sheet, ctx } = setup();
    const scale = rule({
      is: 'scale',
      style: undefined,
      min: { c: '#ffffff', at: 'min' },
      max: { c: '#000000', at: 'max' },
    });
    const out = fileFormatRulesOf({ ...sheet.layout, formatRules: [scale] }, ctx, 'en-GB')!;
    expect(out[0]!.mid).toBeUndefined();
    const { made } = read(out);
    expect(made![0]).toMatchObject({ is: 'scale', min: scale.min, max: scale.max });
    expect(made![0]!.mid).toBeUndefined();
  });
  it('moves a formula to the next rectangle when the anchor is off the grid', () => {
    const { made } = read([
      {
        ranges: [
          { r1: 50, c1: 0, r2: 60, c2: 0 },
          { r1: 2, c1: 1, r2: 3, c2: 1 },
        ],
        is: 'when',
        op: 'formula',
        formula: '=$C51>0',
        style: RED,
      },
    ]);
    expect(made![0]).toMatchObject(box(2, 1, 3, 1));
    expect(made![0]!.also).toBeUndefined();
    expect(made![0]!.fx!.r[0]!.r1).toBe(R(2));
  });
  it('names a rule it cannot make at its anchor, and leaves out one wholly off the grid', () => {
    const { made, losses } = read([
      {
        ranges: [{ r1: 1, c1: 1, r2: 1, c2: 1 }],
        is: 'when',
        op: 'formula',
        formula: '=Nowhere!A1>(',
        style: RED,
      },
      { ranges: [{ r1: 2, c1: 2, r2: 2, c2: 2 }], is: 'when', op: 'gt', a: 1, style: {} },
      { ranges: [{ r1: 99, c1: 0, r2: 99, c2: 0 }], is: 'when', op: 'empty', style: RED },
    ]);
    expect(made).toBeUndefined();
    expect(losses).toEqual([
      { k: 'format_rule_unread', sheet: 'One', r: 1, c: 1 },
      { k: 'format_rule_unread', sheet: 'One', r: 2, c: 2 },
      { k: 'format_rule_unread', sheet: 'One', r: 99, c: 0 },
    ]);
    expect(read([]).made).toBeUndefined();
  });
});
