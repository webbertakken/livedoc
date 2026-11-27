// A sheet's changesets (docs/specs/024-agents/agent-changesets.md "A sheet's changesets", D262-D270): planned whole
// or refused whole, one net change per cell, counts, the inverse in undo order, and the revert keeping what changed
// since.
import { PROTECTION_SYSTEM } from '../protection';
import { describe, expect, it } from 'vitest';
import { applySheetWrite, type SheetWrite } from '../store';
import { makeSheets } from '../testing/book';
import type { Banding, Sheet } from '../sheet';
import { afterImageOf, canonicalJson, cellImage, thingImage, thingKeyOf } from './after-image';
import { planSheetChangeset, type SheetChangesetPlan } from './sheet-changeset';
import { planSheetRevert } from './sheet-revert';

const by = { id: 'p', name: 'P', color: '#000000' };
const ctx = { now: 5, by, check: { checkRules: true }, caller: PROTECTION_SYSTEM };
const R = (i: number) => `s0r${i}`;
const C = (i: number) => `s0c${i}`;
const K = (r: number, c: number) => `${R(r)}:${C(c)}`;

function sheet(cells: Record<string, string> = {}): Sheet {
  return makeSheets({ Costs: cells }, { rows: 6, cols: 4 })[0]!;
}

const band = (x: Partial<Banding> = {}): Banding => ({
  id: 'band01',
  r1: R(0),
  c1: C(0),
  r2: R(3),
  c2: C(2),
  head: '#5b95f9',
  band1: '#ffffff',
  band2: '#e8f0fe',
  foot: '#a8c7fa',
  ...x,
});

const set = (r: number, c: number, v: string | number | null): SheetWrite => ({
  kind: 'cells',
  cells: [{ r: R(r), c: C(c), i: v === null ? null : typeof v === 'number' ? { n: v } : { s: v } }],
});

function plan(s: Sheet, writes: SheetWrite[]): SheetChangesetPlan {
  const p = planSheetChangeset(s, writes, ctx);
  if (!p.ok) throw new Error(`refused ${p.error}`);
  return p;
}

// Every write of a list applied in turn.
function applyAll(s: Sheet, writes: readonly SheetWrite[]): Sheet {
  return writes.reduce((acc, w) => applySheetWrite(acc, w, { now: 9, by }).sheet, s);
}

const cellsOf = (s: Sheet) => [...s.cells].sort(([a], [b]) => a.localeCompare(b));

describe('canonicalJson', () => {
  it('sorts keys at every depth and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[{"y":2,"z":1}]},"b":1}',
    );
    expect(canonicalJson(null)).toBe('null');
  });
});

describe('the after-image', () => {
  it('files cells, things by kind and id, and the title', () => {
    const s = applyAll(sheet({ A1: 'x' }), [
      { kind: 'layout', changes: [{ k: 'band', id: 'band01', band: band() }] },
    ]);
    const image = afterImageOf(s, [K(0, 0), K(1, 1)], ['band:band01', 'object:gone'], true);
    expect(image.cells[K(1, 1)]).toBe(cellImage(undefined));
    expect(image.things['band:band01']).toBe(canonicalJson(band()));
    expect(image.things['object:gone']).toBeNull();
    expect(image.title).toBe('Costs');
    expect(afterImageOf(s, [], [], false).title).toBeUndefined();
  });

  it('names only the changes that set a thing by id', () => {
    expect(thingKeyOf({ k: 'vrule', id: 'v1', rule: null })).toBe('vrule:v1');
    expect(thingKeyOf({ k: 'frule', id: 'f1', rule: null })).toBe('frule:f1');
    expect(thingKeyOf({ k: 'object', id: 'o1', object: null })).toBe('object:o1');
    expect(thingKeyOf({ k: 'freeze', rows: 1 })).toBeNull();
  });

  it('reads each kind of thing from its own list', () => {
    const layout = sheet().layout;
    for (const key of ['object:a', 'vrule:a', 'frule:a', 'band:a'])
      expect(thingImage(layout, key)).toBeNull();
  });
});

describe('planSheetChangeset', () => {
  it('applies writes in order, each against what the ones before left', () => {
    const p = plan(sheet(), [
      { kind: 'layout', changes: [{ k: 'insertRows', after: R(0), ids: ['newr1'] }] },
      { kind: 'cells', cells: [{ r: 'newr1', c: C(0), i: { n: 7 } }] },
    ]);
    expect(p.sheet.layout.rows[1]).toBe('newr1');
    expect(p.sheet.cells.get(`newr1:${C(0)}`)?.input).toEqual({ n: 7 });
    expect(p.applied).toHaveLength(2);
    expect(p.sheet.rev).toBe(2);
    expect(p.counts).toEqual({ added: 1, changed: 0, removed: 0 });
    expect(p.changes).toBe(true);
  });

  it('nets several writes to one change per cell', () => {
    const s = sheet({ A1: '1', B1: '2' });
    const p = plan(s, [
      set(0, 0, 10),
      set(0, 0, 11),
      { kind: 'cells', cells: [{ r: R(0), c: C(1), f: { b: true } }] },
      set(0, 1, null),
      set(1, 0, 'new'),
      set(1, 0, null),
    ]);
    expect(p.net).toEqual([
      { r: R(0), c: C(0), i: { n: 11 } },
      { r: R(0), c: C(1), i: null, f: { b: true } },
    ]);
    expect(p.counts).toEqual({ added: 0, changed: 2, removed: 0 });
  });

  it('writes a format as its difference from the stored one, or clears it whole', () => {
    const s = applyAll(sheet({ A1: '1', A2: '2' }), [
      {
        kind: 'cells',
        cells: [
          { r: R(0), c: C(0), f: { b: true, i: true } },
          { r: R(1), c: C(0), f: { b: true } },
        ],
      },
    ]);
    const p = plan(s, [
      { kind: 'cells', cells: [{ r: R(0), c: C(0), f: { i: null, u: true } }] },
      { kind: 'cells', cells: [{ r: R(1), c: C(0), f: null }] },
    ]);
    expect(p.net).toEqual([
      { r: R(0), c: C(0), f: { b: true, i: null, u: true } },
      { r: R(1), c: C(0), f: null },
    ]);
  });

  it('counts cells removed', () => {
    const p = plan(sheet({ A1: '1' }), [set(0, 0, null)]);
    expect(p.counts).toEqual({ added: 0, changed: 0, removed: 1 });
  });

  it('refuses the whole on one refused write, naming it by position', () => {
    const p = planSheetChangeset(
      sheet(),
      [
        set(0, 0, 1),
        { kind: 'cells', cells: [{ r: R(0), c: C(0), i: { f: { src: '=SUM(' } } as never }] },
      ],
      ctx,
    );
    expect(p).toMatchObject({ ok: false, index: 1 });
  });

  // data-tools.md "Protected ranges" (D347): an agent's changeset is checked write by write against the sheet as it
  // then stands; a warning never stops it, and is named for the room's log.
  it('refuses the whole at a write a protection does not admit, and names the warnings it passed', () => {
    const guarded = (can: 'warn' | 'editors') => {
      const s = sheet();
      const range = { r1: R(0), c1: C(0), r2: R(1), c2: C(0) };
      return { ...s, layout: { ...s.layout, protections: [{ id: 'p1', range, can }] } };
    };
    const participant = { ...ctx, caller: { owner: false, editor: false } };
    expect(
      planSheetChangeset(guarded('editors'), [set(4, 4, 1), set(1, 0, 2)], participant),
    ).toEqual({
      ok: false,
      error: 'protected',
      index: 1,
      at: 'p1',
      line: 'This range is protected: only Editors can change it.',
    });
    const warned = planSheetChangeset(guarded('warn'), [set(1, 0, 2), set(0, 0, 3)], participant);
    expect(warned).toMatchObject({ ok: true, warned: ['p1'] });
    expect(plan(sheet(), [set(1, 0, 2)]).warned).toEqual([]);
  });

  it('refuses a write the engine cannot apply', () => {
    const broken = { kind: 'layout', changes: [null] } as never;
    const p = planSheetChangeset(sheet(), [broken], { ...ctx, check: {} });
    expect(p).toMatchObject({ ok: false, index: 0 });
  });

  it('trims a title and files it in the after-image', () => {
    const p = plan(sheet(), [{ kind: 'title', title: '  Budget ' }]);
    expect(p.sheet.title).toBe('Budget');
    expect(p.after.title).toBe('Budget');
    expect(p.changes).toBe(true);
  });

  it('says when nothing changes', () => {
    const s = sheet({ A1: '1' });
    expect(plan(s, [set(0, 0, 1)]).changes).toBe(false);
    expect(plan(s, [set(0, 0, 1)]).net).toEqual([]);
  });

  it('answers a layout change with no cells as a change', () => {
    const p = plan(sheet(), [{ kind: 'layout', changes: [{ k: 'freeze', rows: 1 }] }]);
    expect(p.changes).toBe(true);
    expect(p.net).toEqual([]);
  });

  it('undoes itself with its inverse, last write first', () => {
    const s = sheet({ A1: '1', A3: '3', B2: '=A1*2' });
    const p = plan(s, [
      set(0, 0, 5),
      { kind: 'layout', changes: [{ k: 'deleteRows', ids: [R(2)] }] },
      { kind: 'layout', changes: [{ k: 'band', id: 'band01', band: band() }] },
      { kind: 'title', title: 'Budget' },
    ]);
    const back = applyAll(p.sheet, p.inverse);
    expect(back.layout).toEqual(s.layout);
    expect(cellsOf(back)).toEqual(cellsOf(s));
    expect(back.title).toBe('Costs');
  });
});

describe('planSheetRevert', () => {
  it('reverts a changeset nothing has touched since', () => {
    const s = sheet({ A1: '1' });
    const p = plan(s, [set(0, 0, 2), set(1, 1, 'x')]);
    const r = planSheetRevert(p.sheet, p.inverse, p.after);
    expect(r.kept).toEqual([]);
    expect(cellsOf(applyAll(p.sheet, r.writes))).toEqual(cellsOf(s));
  });

  it('keeps a cell changed since and reverts the rest', () => {
    const s = sheet({ A1: '1' });
    const p = plan(s, [set(0, 0, 2), set(1, 1, 'x')]);
    const since = applyAll(p.sheet, [set(0, 0, 3)]);
    const r = planSheetRevert(since, p.inverse, p.after);
    expect(r.kept).toEqual([K(0, 0)]);
    const back = applyAll(since, r.writes);
    expect(back.cells.get(K(0, 0))?.input).toEqual({ n: 3 });
    expect(back.cells.get(K(1, 1))).toBeUndefined();
  });

  it('keeps inserted rows a person has typed in since, and deletes the rest', () => {
    const s = sheet();
    const p = plan(s, [
      { kind: 'layout', changes: [{ k: 'insertRows', after: R(0), ids: ['newr1', 'newr2'] }] },
      { kind: 'cells', cells: [{ r: 'newr1', c: C(0), i: { s: 'agent' } }] },
    ]);
    const since = applyAll(p.sheet, [
      { kind: 'cells', cells: [{ r: 'newr2', c: C(1), i: { s: 'me' } }] },
    ]);
    const r = planSheetRevert(since, p.inverse, p.after);
    expect(r.kept).toEqual(['row:newr2']);
    const back = applyAll(since, r.writes);
    expect(back.layout.rows).toContain('newr2');
    expect(back.layout.rows).not.toContain('newr1');
  });

  it('keeps inserted columns holding a cell changed since', () => {
    const p = plan(sheet(), [
      { kind: 'layout', changes: [{ k: 'insertCols', after: C(0), ids: ['newc1'] }] },
    ]);
    const since = applyAll(p.sheet, [
      { kind: 'cells', cells: [{ r: R(0), c: 'newc1', i: { n: 1 } }] },
    ]);
    const r = planSheetRevert(since, p.inverse, p.after);
    expect(r.kept).toEqual(['col:newc1']);
  });

  it('keeps a banding changed since, and the title renamed since', () => {
    const p = plan(sheet(), [
      { kind: 'layout', changes: [{ k: 'band', id: 'band01', band: band() }] },
      { kind: 'title', title: 'Budget' },
    ]);
    const since = applyAll(p.sheet, [
      { kind: 'layout', changes: [{ k: 'band', id: 'band01', band: band({ band2: '#000000' }) }] },
      { kind: 'title', title: 'Mine' },
    ]);
    const r = planSheetRevert(since, p.inverse, p.after);
    expect(r.kept.sort()).toEqual(['band:band01', 'title']);
    expect(r.writes).toEqual([]);
  });

  it('puts the title and things back when unchanged since', () => {
    const p = plan(sheet(), [
      {
        kind: 'layout',
        changes: [
          { k: 'band', id: 'band01', band: band() },
          { k: 'freeze', rows: 1 },
        ],
      },
      { kind: 'title', title: 'Budget' },
    ]);
    const r = planSheetRevert(p.sheet, p.inverse, p.after);
    const back = applyAll(p.sheet, r.writes);
    expect(back.title).toBe('Costs');
    expect(back.layout.bands ?? []).toEqual([]);
    expect(back.layout.frozenRows ?? 0).toBe(0);
  });

  it('keeps a layout write whose cells survive when its changes are all kept', () => {
    const s = sheet({ A1: '1' });
    const p = plan(s, [
      {
        kind: 'layout',
        changes: [{ k: 'band', id: 'band01', band: band() }],
        cells: [{ r: R(0), c: C(0), i: { n: 2 } }],
      },
    ]);
    const since = applyAll(p.sheet, [
      { kind: 'layout', changes: [{ k: 'band', id: 'band01', band: null }] },
    ]);
    const r = planSheetRevert(since, p.inverse, p.after);
    expect(r.kept).toEqual(['band:band01']);
    expect(applyAll(since, r.writes).cells.get(K(0, 0))?.input).toEqual({ n: 1 });
  });

  it('writes nothing for a changeset reverted already', () => {
    const p = plan(sheet({ A1: '1' }), [set(0, 0, 2)]);
    const once = applyAll(p.sheet, planSheetRevert(p.sheet, p.inverse, p.after).writes);
    const twice = planSheetRevert(once, p.inverse, p.after);
    expect(twice.writes).toEqual([]);
    expect(twice.kept).toEqual([K(0, 0)]);
  });

  it('a title write with no title in the after-image goes back', () => {
    const r = planSheetRevert(sheet(), [{ kind: 'title', title: 'Old' }], {
      cells: {},
      things: {},
    });
    expect(r.writes).toEqual([{ kind: 'title', title: 'Old' }]);
  });
});
