// A Dropdown from a Range on any sheet (docs/specs/029-sheets/data-validation.md "Rules"): read and written as text,
// its options and line read from its sheet, kept when that sheet loses rows, and carried by title in a copy.
import { describe, expect, it } from 'vitest';
import {
  applySheetWrite,
  inverseSheetWrite,
  shrinkLayoutSourcesOf,
  type SheetWrite,
} from '../store';
import { validateWrite } from '../validate';
import { book } from '../testing/book';
import { sheetCopyOf } from '../workbook/sheet-copy';
import type { Sheet, ValidationRule } from '../sheet';
import { rangeOptions, ruleLine } from './validation';
import { workbookRuleChecks } from './validation-formula';
import { sourceFromText, sourceSheetOf, sourceText, splitSheetText } from './rule-source';

const by = { id: 'p', name: 'P', color: '#000000' };

function twoSheets() {
  const b = book(
    { Sheet1: {}, 'My Lists': { A1: 'Red', A2: 'Green', A3: '', A4: 'red' } },
    { rows: 10, cols: 4 },
  );
  const [one, lists] = b.sheets as [Sheet, Sheet];
  const ctx = b.wb.ctxFor(one.id);
  const src = sourceFromText(ctx, "'My Lists'!A1:A4")!;
  const rule: ValidationRule = {
    id: 'rule01',
    r1: one.layout.rows[0]!,
    c1: one.layout.cols[1]!,
    r2: one.layout.rows[4]!,
    c2: one.layout.cols[1]!,
    is: 'range',
    src,
  };
  const write: SheetWrite = { kind: 'layout', changes: [{ k: 'vrule', id: rule.id, rule }] };
  const next = applySheetWrite(one, write, { now: 1, by }).sheet;
  b.wb.updateSheet(next);
  return { b, one: next, lists, rule };
}

describe('a dropdown source on another sheet', () => {
  it('reads and writes its text, quoting a title that needs it', () => {
    expect(splitSheetText(" 'It''s'!A1:B2 ")).toEqual({ title: "It's", range: 'A1:B2' });
    expect(splitSheetText('A1:B2')).toEqual({ title: null, range: 'A1:B2' });
    const { b, one, lists, rule } = twoSheets();
    const ctx = b.wb.ctxFor(one.id);
    expect(rule.src).toMatchObject({ s: lists.id, r1: lists.layout.rows[0] });
    expect(sourceText(sourceSheetOf(ctx, rule.src!), rule.src!)).toBe("'My Lists'!A1:A4");
    const own = sourceFromText(ctx, 'C1:C2')!;
    expect(own.s).toBeUndefined();
    expect(sourceText(sourceSheetOf(ctx, own), own)).toBe('C1:C2');
    expect(sourceFromText(ctx, 'Nowhere!A1')).toBeNull();
    expect(sourceFromText(ctx, "'My Lists'!A99")).toBeNull();
    expect(sourceFromText(ctx, 'nope')).toBeNull();
  });
  it('offers that sheet values and names it in its line', () => {
    const { b, one, rule } = twoSheets();
    expect(rangeOptions(b.wb, one.id, rule).map((o) => o.shown)).toEqual(['Red', 'Green']);
    const ctx = { locale: 'en-GB', layout: one.layout, ...workbookRuleChecks(b.wb, one.id) };
    expect(ruleLine(rule, ctx)).toBe("Choose one of the values in 'My Lists'!A1:A4");
    expect(ruleLine(rule, { locale: 'en-GB', layout: one.layout })).toBe(
      'Choose one of the listed values',
    );
  });
  it('names that sheet when a write is refused', () => {
    const { b, one } = twoSheets();
    const w: SheetWrite = {
      kind: 'cells',
      cells: [{ r: one.layout.rows[0]!, c: one.layout.cols[1]!, i: { s: 'Blue' } }],
    };
    expect(validateWrite(one, w, workbookRuleChecks(b.wb, one.id))).toMatchObject({
      ok: false,
      line: "Choose one of the values in 'My Lists'!A1:A4",
    });
  });
  it('offers nothing once its sheet is gone', () => {
    const { b, one, lists, rule } = twoSheets();
    b.wb.removeSheet(lists.id);
    expect(rangeOptions(b.wb, one.id, rule)).toEqual([]);
    const ctx = { locale: 'en-GB', layout: one.layout, ...workbookRuleChecks(b.wb, one.id) };
    expect(ruleLine(rule, ctx)).toBe('Choose one of the listed values');
  });
  it('is stored with a sheet id or a title, never both, its corners never checked here', () => {
    const { one, rule } = twoSheets();
    const ok = (src: unknown) =>
      validateWrite(one, {
        kind: 'layout',
        changes: [{ k: 'vrule', id: 'rule02', rule: { ...rule, id: 'rule02', src } as never }],
      }).ok;
    expect(ok(rule.src)).toBe(true);
    expect(ok({ ...rule.src, s: undefined, st: 'My Lists' })).toBe(true);
    expect(ok({ ...rule.src, st: 'My Lists' })).toBe(false);
    expect(ok({ ...rule.src, s: 'bad id!' })).toBe(false);
    expect(ok({ ...rule.src, s: undefined, st: '' })).toBe(false);
    expect(ok({ ...rule.src, s: undefined })).toBe(false);
  });
  it('shrinks when its sheet loses rows, goes when they all go, and comes back with the undo', () => {
    const { one, lists, rule } = twoSheets();
    const del = (ids: string[]) =>
      shrinkLayoutSourcesOf(lists.id, lists.layout, [{ k: 'deleteRows', ids }], one.layout);
    expect(del([one.layout.rows[0]!])).toEqual([]);
    const shrunk = del([lists.layout.rows[0]!]);
    expect(shrunk).toEqual([
      {
        k: 'vrule',
        id: 'rule01',
        rule: { ...rule, src: { ...rule.src, r1: lists.layout.rows[1] } },
      },
    ]);
    const write: SheetWrite = { kind: 'layout', changes: shrunk };
    const r = applySheetWrite(one, write, { now: 1, by });
    expect(
      applySheetWrite(r.sheet, inverseSheetWrite(one, r), { now: 1, by }).sheet.layout.rules,
    ).toEqual([rule]);
    expect(del(lists.layout.rows.slice(0, 4))).toEqual([{ k: 'vrule', id: 'rule01', rule: null }]);
    // Its own sheet's deletions leave it.
    const own = applySheetWrite(
      one,
      { kind: 'layout', changes: [{ k: 'deleteRows', ids: [one.layout.rows[8]!] }] },
      { now: 1, by },
    ).sheet;
    expect(own.layout.rules).toEqual([rule]);
  });
  it('is carried by title into a copy', () => {
    const { b, one, rule } = twoSheets();
    const copy = sheetCopyOf(one, b.wb.ctxFor(one.id), { id: 'copy01xx', title: 'Copy' });
    expect(copy.layout.rules![0]!.src).toEqual({ ...rule.src, s: undefined, st: 'My Lists' });
  });
});
