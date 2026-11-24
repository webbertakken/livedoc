// Alternating colours (docs/specs/029-sheets/formatting.md "Alternating colours", D216): the band a row takes, what a
// banding may be, the layout changes and their undo, deletions, the static render, and the files' format rules.
import { describe, expect, it } from 'vitest';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from '../store';
import { validateSheetCreate, validateWrite } from '../validate';
import { book, makeSheets } from '../testing/book';
import { renderWindow } from '../engine/render';
import { resetSheetWrite } from '../sheet-starters';
import { BANDINGS_MAX } from '../limits';
import type { Banding, Sheet } from '../sheet';
import {
  BANDING_STYLES,
  bandingAt,
  bandingFill,
  bandingFillAt,
  bandingRules,
  bandingWith,
  newBanding,
} from './bandings';

const by = { id: 'p', name: 'P', color: '#000000' };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const apply = (s: Sheet, w: SheetWrite) => applySheetWrite(s, w, { now: 1, by }).sheet;
const band = (x: Partial<Banding> = {}, r1 = 1, c1 = 0, r2 = 6, c2 = 2): Banding => ({
  id: 'band01',
  r1: R(r1),
  c1: C(c1),
  r2: R(r2),
  c2: C(c2),
  head: '#5b95f9',
  band1: '#ffffff',
  band2: '#e8f0fe',
  foot: '#a8c7fa',
  ...x,
});
const set = (b: Banding): SheetWrite => ({
  kind: 'layout',
  changes: [{ k: 'band', id: b.id, band: b }],
});
const base = () => makeSheets({ 'Sheet 1': {} }, { rows: 10, cols: 4 })[0]!;

describe('the band a row takes', () => {
  it('shades the header, then colour 1 and colour 2 alternating, then the footer', () => {
    const b = band({ header: true, footer: true });
    const s = apply(base(), set(b));
    const at = (r: number, c = 0) => bandingFillAt(s.layout, r, c);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((r) => at(r))).toEqual([
      null,
      '#5b95f9',
      '#ffffff',
      '#e8f0fe',
      '#ffffff',
      '#e8f0fe',
      '#a8c7fa',
      null,
    ]);
    expect(at(2, 3)).toBeNull();
    expect(bandingAt(s.layout, 2, 1)?.id).toBe('band01');
    const plain = apply(base(), set(band()));
    expect([1, 2, 6].map((r) => bandingFillAt(plain.layout, r, 0))).toEqual([
      '#ffffff',
      '#e8f0fe',
      '#e8f0fe',
    ]);
    // A one-row banding with both: the header wins.
    expect(bandingFill(band({ header: true, footer: true }), { r1: 1, r2: 1 }, 1)).toBe('#5b95f9');
    expect(bandingFillAt(base().layout, 0, 0)).toBeNull();
  });
});

describe('making and editing', () => {
  it('makes one in the first style with its header, and restyles one', () => {
    expect(newBanding('band02', { r1: R(0), c1: C(0), r2: R(3), c2: C(1) })).toEqual({
      id: 'band02',
      r1: R(0),
      c1: C(0),
      r2: R(3),
      c2: C(1),
      ...BANDING_STYLES[0]!.colours,
      header: true,
    });
    expect(BANDING_STYLES).toHaveLength(8);
    expect(bandingWith(band({ header: true }), BANDING_STYLES[1]!.colours)).toMatchObject({
      ...BANDING_STYLES[1]!.colours,
      header: true,
    });
  });
  it('sets, replaces and removes one, each undone; Clear Sheet removes them', () => {
    const s0 = base();
    const made = applySheetWrite(s0, set(band()), { now: 1, by });
    expect(made.sheet.layout.bands).toHaveLength(1);
    expect(apply(made.sheet, inverseSheetWrite(s0, made)).layout.bands).toBeUndefined();
    const edited = applySheetWrite(made.sheet, set(band({ band1: '#000000' })), { now: 1, by });
    expect(edited.sheet.layout.bands![0]!.band1).toBe('#000000');
    expect(apply(edited.sheet, inverseSheetWrite(made.sheet, edited)).layout.bands![0]!.band1).toBe(
      '#ffffff',
    );
    const gone = apply(made.sheet, {
      kind: 'layout',
      changes: [{ k: 'band', id: 'band01', band: null }],
    });
    expect(gone.layout.bands).toBeUndefined();
    expect(apply(made.sheet, resetSheetWrite(made.sheet)).layout.bands).toBeUndefined();
  });
  it('shrinks with deleted rows, goes with its last, and comes back with the undo', () => {
    const s = apply(base(), set(band({}, 1, 0, 2, 0)));
    const del = applySheetWrite(
      s,
      { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(1)] }] },
      { now: 1, by },
    );
    expect(del.sheet.layout.bands![0]!.r1).toBe(R(2));
    expect(apply(del.sheet, inverseSheetWrite(s, del)).layout.bands).toEqual(s.layout.bands);
    const all = apply(s, { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(1), R(2)] }] });
    expect(all.layout.bands).toBeUndefined();
  });
});

describe('what a banding may be', () => {
  const ok = (x: unknown, on: Sheet = base()) =>
    validateWrite(on, {
      kind: 'layout',
      changes: [{ k: 'band', id: 'band01', band: x as Banding }],
    }).ok;
  it('holds colours, switches and a range on the sheet, never over another', () => {
    expect(ok(band())).toBe(true);
    expect(ok(band({ header: true, footer: true }))).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok(band({ head: 'red' }))).toBe(false);
    expect(ok(band({ header: false as never }))).toBe(false);
    expect(ok({ ...band(), extra: 1 })).toBe(false);
    expect(ok({ ...band(), r2: 'gone00' })).toBe(false);
    expect(ok({ ...band(), id: 'other1' })).toBe(false);
    expect(ok('band')).toBe(false);
    const other = apply(base(), set(band({ id: 'band02' }, 5, 0, 8, 0)));
    expect(ok(band(), other)).toBe(false);
    expect(ok(band({}, 0, 0, 4, 0), other)).toBe(true);
    // Editing a banding in place never overlaps itself.
    expect(
      validateWrite(other, {
        kind: 'layout',
        changes: [{ k: 'band', id: 'band02', band: band({ id: 'band02' }, 4, 0, 9, 0) }],
      }).ok,
    ).toBe(true);
    expect(
      validateWrite(base(), { kind: 'layout', changes: [{ k: 'band', id: 'bad id', band: null }] })
        .ok,
    ).toBe(false);
  });
  it('holds at most the limit, and a copy carries them checked', () => {
    const s = base();
    const many: Sheet = {
      ...s,
      layout: {
        ...s.layout,
        bands: Array.from({ length: BANDINGS_MAX }, (_, i) =>
          band({ id: `b${String(i).padStart(5, '0')}` }, 0, 0, 0, 0),
        ),
      },
    };
    expect(validateWrite(many, set(band({ id: 'zzzzzz' }, 9, 3, 9, 3)))).toMatchObject({
      ok: false,
      error: 'rules_full',
    });
    expect(validateSheetCreate({ ...s, layout: { ...s.layout, bands: [band()] } }).ok).toBe(true);
    expect(
      validateSheetCreate({ ...s, layout: { ...s.layout, bands: [band({ band2: 'x' })] } }).ok,
    ).toBe(false);
    expect(validateSheetCreate({ ...s, layout: { ...s.layout, bands: 'x' as never } }).ok).toBe(
      false,
    );
  });
});

describe('drawn', () => {
  it('fills the static render under a cell\u2019s own fill', () => {
    const b = book({ A2: 'x', A3: 'y', A4: 'z' }, { rows: 10, cols: 4 });
    let s = b.sheets[0]!;
    s = apply(s, set(band({ header: true }, 1, 0, 3, 0)));
    const key = `${R(3)}:${C(0)}`;
    s.cells.set(key, { ...s.cells.get(key)!, format: { bg: '#123456' } });
    b.wb.updateSheet(s);
    const model = renderWindow(b.wb, s.id, { width: 500, height: 200 }, 'en-GB')!;
    const fill = (r: number) => model.cells.find((x) => x.r === r && x.c === 0)?.fill;
    expect([fill(1), fill(2), fill(3)]).toEqual(['#5b95f9', '#ffffff', '#123456']);
  });
});

describe('as format rules in a file', () => {
  it('writes the header, colour rows and footer as rules over the range', () => {
    const s = apply(base(), set(band({ header: true, footer: true })));
    expect(bandingRules(s.layout)).toEqual([
      {
        ranges: [{ r1: 1, c1: 0, r2: 1, c2: 2 }],
        is: 'when',
        op: 'formula',
        formula: '=TRUE',
        style: { bg: '#5b95f9' },
      },
      {
        ranges: [{ r1: 2, c1: 0, r2: 5, c2: 2 }],
        is: 'when',
        op: 'formula',
        formula: '=ISEVEN(ROW()-ROW($A$3))',
        style: { bg: '#ffffff' },
      },
      {
        ranges: [{ r1: 2, c1: 0, r2: 5, c2: 2 }],
        is: 'when',
        op: 'formula',
        formula: '=ISODD(ROW()-ROW($A$3))',
        style: { bg: '#e8f0fe' },
      },
      {
        ranges: [{ r1: 6, c1: 0, r2: 6, c2: 2 }],
        is: 'when',
        op: 'formula',
        formula: '=TRUE',
        style: { bg: '#a8c7fa' },
      },
    ]);
    const one = apply(base(), set(band({ header: true }, 1, 0, 1, 0)));
    expect(bandingRules(one.layout)).toHaveLength(1);
    const bare = apply(base(), set(band({}, 1, 0, 2, 0)));
    expect(bandingRules(bare.layout).map((x) => x.ranges[0])).toEqual([
      { r1: 1, c1: 0, r2: 2, c2: 0 },
      { r1: 1, c1: 0, r2: 2, c2: 0 },
    ]);
    expect(bandingRules(base().layout)).toEqual([]);
    expect(bandingRules({ ...base().layout, bands: [{ ...band(), r1: 'gone00' }] })).toEqual([]);
  });
});
