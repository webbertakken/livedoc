// docs/specs/029-sheets/data-tools.md "Protected ranges" (D345, D347): what a protection admits, and which writes
// it refuses, for every kind of write the room takes.
import { describe, expect, it } from 'vitest';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from './store';
import { emptyLayout, emptySheet, type IdRange, type SheetLayout } from './sheet';
import {
  Protection,
  isProtection,
  protectedBoxes,
  protectionRefusal,
  protectionsAt,
  protectionsTouched,
  type ProtectionCaller,
} from './protection';

let n = 5;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const base = emptyLayout(rand, 10, 6);
const R = base.rows;
const C = base.cols;
// B3:C5 by place.
const range = (r1: number, c1: number, r2: number, c2: number): IdRange => ({
  r1: R[r1]!,
  c1: C[c1]!,
  r2: R[r2]!,
  c2: C[c2]!,
});
const guard: Protection = { id: 'p1', range: range(2, 1, 4, 2), can: 'editors' };
const sheetGuard: Protection = { id: 'p2', can: 'owner', except: [range(0, 0, 0, 5)] };
const withGuards = (...guards: Protection[]): SheetLayout => ({ ...base, protections: guards });

const participant: ProtectionCaller = { owner: false, editor: false };
const editor: ProtectionCaller = { owner: false, editor: true };
const owner: ProtectionCaller = { owner: true, editor: true };

const cell = (r: number, c: number): SheetWrite => ({
  kind: 'cells',
  cells: [{ r: R[r]!, c: C[c]!, i: { n: 1 } }],
});
const layoutWrite = (...changes: object[]): SheetWrite =>
  ({ kind: 'layout', changes }) as SheetWrite;

describe('Protection.admits', () => {
  it('admits by permission: a warning anyone, Editors Only the Editors and the owner, Only the Owner the owner', () => {
    const warn = { ...guard, can: 'warn' as const };
    expect([participant, editor, owner].map((c) => Protection.admits(warn, c))).toEqual([
      true,
      true,
      true,
    ]);
    expect([participant, editor, owner].map((c) => Protection.admits(guard, c))).toEqual([
      false,
      true,
      true,
    ]);
    expect([participant, editor, owner].map((c) => Protection.admits(sheetGuard, c))).toEqual([
      false,
      false,
      true,
    ]);
  });
});

describe('Protection.refusalLine', () => {
  it('says what is protected and who may change it', () => {
    expect(Protection.refusalLine(guard)).toBe(
      'This range is protected: only Editors can change it.',
    );
    expect(Protection.refusalLine(sheetGuard)).toBe(
      'This sheet is protected: only the owner can change it.',
    );
  });
});

describe('protectionsAt', () => {
  it('finds the protections over a cell: a range’s inside it, a sheet’s but in its exceptions', () => {
    const layout = withGuards(guard, sheetGuard);
    expect(protectionsAt(layout, 3, 1).map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(protectionsAt(layout, 0, 3).map((p) => p.id)).toEqual([]);
    expect(protectionsAt(layout, 6, 3).map((p) => p.id)).toEqual(['p2']);
    expect(protectionsAt(base, 3, 1)).toEqual([]);
  });

  it('passes over a protection whose cells are gone, and covers every cell of a sheet without exceptions', () => {
    const gone = { ...guard, range: { ...guard.range!, r1: 'gone' } };
    expect(protectionsAt(withGuards(gone), 3, 1)).toEqual([]);
    expect(protectionsTouched(withGuards(gone), cell(3, 1))).toEqual([]);
    expect(protectionsAt(withGuards({ id: 'p3', can: 'warn' }), 0, 0).map((p) => p.id)).toEqual([
      'p3',
    ]);
  });
});

describe('protectionRefusal', () => {
  const layout = withGuards(guard);
  const refused = (write: SheetWrite, caller = participant, l = layout) =>
    protectionRefusal(l, write, caller)?.id ?? null;

  it('refuses a cell write inside a range it does not admit, and passes one outside', () => {
    expect(refused(cell(3, 2))).toBe('p1');
    expect(refused(cell(3, 2), editor)).toBeNull();
    expect(refused(cell(5, 2))).toBeNull();
    expect(refused(cell(3, 3))).toBeNull();
  });

  it('refuses rows or columns inserted inside it, never at its edges', () => {
    const insert = (k: string, after: string | null) => layoutWrite({ k, after, ids: ['new1'] });
    expect(refused(insert('insertRows', R[2]!))).toBe('p1');
    expect(refused(insert('insertRows', R[3]!))).toBe('p1');
    expect(refused(insert('insertRows', R[4]!))).toBeNull();
    expect(refused(insert('insertRows', R[1]!))).toBeNull();
    expect(refused(insert('insertRows', null))).toBeNull();
    expect(refused(insert('insertRows', 'nowhere'))).toBeNull();
    expect(refused(insert('insertCols', C[1]!))).toBe('p1');
    expect(refused(insert('insertCols', C[2]!))).toBeNull();
  });

  it('refuses its rows or columns deleted, moved or sorted', () => {
    expect(refused(layoutWrite({ k: 'deleteRows', ids: [R[4]!] }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'deleteRows', ids: [R[7]!] }))).toBeNull();
    expect(refused(layoutWrite({ k: 'deleteCols', ids: [C[2]!] }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'moveRows', ids: [R[8]!], after: R[2]! }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'moveRows', ids: [R[3]!], after: R[8]! }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'moveRows', ids: [R[8]!], after: R[0]! }))).toBeNull();
    expect(refused(layoutWrite({ k: 'moveCols', ids: [C[5]!], after: null }))).toBeNull();
    expect(refused(layoutWrite({ k: 'orderRows', ids: [R[9]!, R[3]!] }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'orderCols', ids: [C[5]!, C[4]!] }))).toBeNull();
  });

  it('refuses merges and rules over its cells, and passes sizes, hiding, filters and names', () => {
    const over = range(4, 2, 6, 3);
    const away = range(7, 0, 8, 1);
    expect(refused(layoutWrite({ k: 'merge', range: over }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'merge', range: away }))).toBeNull();
    expect(refused(layoutWrite({ k: 'unmerge', range: over }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'merges', merges: [over] }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'merges', merges: [away] }))).toBeNull();
    const merged = { ...layout, merges: [over] };
    expect(refused(layoutWrite({ k: 'merges', merges: [] }), participant, merged)).toBe('p1');
    const rule = (r: IdRange) => ({ id: 'v1', ...r, is: 'check' });
    expect(refused(layoutWrite({ k: 'vrule', id: 'v1', rule: rule(over) }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'vrule', id: 'v1', rule: rule(away) }))).toBeNull();
    const ruled = { ...layout, rules: [rule(over)] } as SheetLayout;
    expect(refused(layoutWrite({ k: 'vrule', id: 'v1', rule: null }), participant, ruled)).toBe(
      'p1',
    );
    const frule = { id: 'f1', ...away, also: [over], is: 'notEmpty', style: {} };
    expect(refused(layoutWrite({ k: 'frule', id: 'f1', rule: frule }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'band', id: 'b1', band: { id: 'b1', ...over } }))).toBe('p1');
    const banded = { ...layout, bands: [{ id: 'b1', ...over }] } as SheetLayout;
    expect(refused(layoutWrite({ k: 'band', id: 'b1', band: null }), participant, banded)).toBe(
      'p1',
    );
    const plain = { id: 'f2', ...over, is: 'notEmpty', style: {} };
    expect(refused(layoutWrite({ k: 'frule', id: 'f2', rule: plain }))).toBe('p1');
    expect(refused(layoutWrite({ k: 'frule', id: 'f3', rule: null }))).toBeNull();
    const formatted = { ...layout, formatRules: [plain] } as SheetLayout;
    expect(refused(layoutWrite({ k: 'frule', id: 'f2', rule: null }), participant, formatted)).toBe(
      'p1',
    );
    for (const change of [
      { k: 'size', axis: 'r', ids: [R[3]!], px: 40 },
      { k: 'hide', axis: 'r', ids: [R[3]!], hidden: true },
      { k: 'filterCond', col: C[1]!, cond: null },
      { k: 'name', name: 'Total', range: over },
      { k: 'freeze', rows: 2 },
    ])
      expect(refused(layoutWrite(change)), change.k).toBeNull();
  });

  it('refuses a change to a protection itself by one it does not admit', () => {
    expect(refused(layoutWrite({ k: 'protection', id: 'p1', protection: null }))).toBe('p1');
    expect(
      refused(layoutWrite({ k: 'protection', id: 'p1', protection: null }), editor),
    ).toBeNull();
    expect(
      refused(layoutWrite({ k: 'protection', id: 'p9', protection: { id: 'p9', can: 'warn' } })),
    ).toBeNull();
  });

  it('refuses every write to a protected sheet but cells in its exceptions', () => {
    const sheet = withGuards(sheetGuard);
    expect(refused(cell(0, 3), editor, sheet)).toBeNull();
    expect(refused(cell(5, 3), editor, sheet)).toBe('p2');
    expect(refused(cell(5, 3), owner, sheet)).toBeNull();
    expect(refused({ kind: 'title', title: 'New' }, editor, sheet)).toBe('p2');
    expect(
      refused(layoutWrite({ k: 'size', axis: 'r', ids: [R[3]!], px: 40 }), editor, sheet),
    ).toBe('p2');
    expect(
      refused(
        { kind: 'layout', changes: [], cells: [{ r: R[0]!, c: C[1]!, i: null }] },
        editor,
        sheet,
      ),
    ).toBeNull();
    // Another protection's own change is no change to the sheet.
    const both = withGuards(sheetGuard, { ...guard, can: 'warn' });
    expect(
      refused(layoutWrite({ k: 'protection', id: 'p1', protection: null }), editor, both),
    ).toBeNull();
    expect(
      refused(layoutWrite({ k: 'protection', id: 'p2', protection: null }), editor, both),
    ).toBe('p2');
  });

  it('lists the warning protections a write touches, which never refuse', () => {
    const warn = withGuards({ ...guard, can: 'warn' });
    expect(protectionRefusal(warn, cell(3, 1), participant)).toBeNull();
    expect(protectionsTouched(warn, cell(3, 1)).map((p) => p.id)).toEqual(['p1']);
    expect(protectionsTouched(warn, cell(8, 1))).toEqual([]);
    expect(protectionsTouched(base, cell(3, 1))).toEqual([]);
  });
});

describe('protections in the sheet store', () => {
  const sheet = emptySheet({ id: 'sheet1', tabId: 't1', title: 'Sheet1', layout: base });
  const put = (p: Protection | null, id = 'p1'): SheetWrite =>
    layoutWrite({ k: 'protection', id, protection: p });
  const applied = (s: typeof sheet, w: SheetWrite) =>
    applySheetWrite(s, w, { now: 1, by: { id: 'me', name: 'Me', color: '#123456' } }).sheet;

  it('adds, replaces and removes a protection by id', () => {
    const added = applied(sheet, put(guard));
    expect(added.layout.protections).toEqual([guard]);
    const changed = applied(added, put({ ...guard, can: 'warn' }));
    expect(changed.layout.protections).toEqual([{ ...guard, can: 'warn' }]);
    expect(applied(changed, put(null)).layout.protections).toBeUndefined();
  });

  it('puts back what a protection was on undo', () => {
    const held = applied(sheet, put(guard));
    const result = applySheetWrite(held, put(null), {
      now: 1,
      by: { id: 'me', name: 'Me', color: '#123456' },
    });
    expect(inverseSheetWrite(held, result)).toEqual(put(guard));
  });

  it('shrinks a sheet’s exceptions as their rows go, keeping those left', () => {
    const open = { id: 'p4', can: 'warn' as const, except: [range(0, 0, 0, 5), range(5, 0, 6, 0)] };
    const held = applied(applied(sheet, put(open, 'p4')), put({ id: 'p5', can: 'warn' }, 'p5'));
    const left = applied(held, layoutWrite({ k: 'deleteRows', ids: [R[0]!] }));
    expect(left.layout.protections).toEqual([
      { id: 'p4', can: 'warn', except: [range(5, 0, 6, 0)] },
      { id: 'p5', can: 'warn' },
    ]);
  });

  it('shrinks a range’s protection as its rows go, and drops one whose cells all went', () => {
    const held = applied(sheet, put(guard));
    const shrunk = applied(held, layoutWrite({ k: 'deleteRows', ids: [R[2]!] }));
    expect(shrunk.layout.protections).toEqual([
      { ...guard, range: { ...guard.range!, r1: R[3]! } },
    ]);
    const gone = applied(held, layoutWrite({ k: 'deleteRows', ids: [R[2]!, R[3]!, R[4]!] }));
    expect(gone.layout.protections).toBeUndefined();
    const sheetHeld = applied(sheet, put(sheetGuard, 'p2'));
    const left = applied(sheetHeld, layoutWrite({ k: 'deleteRows', ids: [R[0]!] }));
    expect(left.layout.protections).toEqual([{ id: 'p2', can: 'owner' }]);
  });
});

describe('isProtection', () => {
  it('takes a well-made protection of cells on the sheet, and refuses others', () => {
    expect(isProtection(guard, 'p1', base)).toBe(true);
    expect(isProtection({ ...sheetGuard, description: 'Totals' }, 'p2', base)).toBe(true);
    expect(isProtection({ id: 'p2', can: 'owner' }, 'p2', base)).toBe(true);
    for (const bad of [
      null,
      { ...guard, id: 'other' },
      { ...guard, can: 'anyone' },
      { ...guard, range: { ...guard.range!, r1: 'nowhere' } },
      { ...guard, description: 'd'.repeat(201) },
      { ...guard, description: 3 },
      { ...guard, except: [range(0, 0, 0, 0)] },
      { ...sheetGuard, id: 'p1', except: Array.from({ length: 51 }, () => range(0, 0, 0, 0)) },
      { ...sheetGuard, id: 'p1', except: 'all' },
      { ...guard, range: 'A1' },
    ])
      expect(isProtection(bad, 'p1', base), JSON.stringify(bad)?.slice(0, 60)).toBe(false);
  });

  it('takes what a protected sheet’s file held, by its format’s own attribute names', () => {
    const xlsx = { standard: 'ooxml', attributes: { password: 'CC1A', formatCells: '0' } };
    const ods = {
      standard: 'odf',
      attributes: {
        'table:protection-key': 'k=',
        'table:protection-key-digest-algorithm': 'http://www.w3.org/2000/09/xmldsig#sha256',
      },
    };
    expect(isProtection({ ...sheetGuard, kept: xlsx }, 'p2', base)).toBe(true);
    expect(isProtection({ ...sheetGuard, kept: ods }, 'p2', base)).toBe(true);
    for (const kept of [
      null,
      'CC1A',
      { standard: 'pdf', attributes: {} },
      { standard: 'ooxml', attributes: { sheet: '1' } },
      { standard: 'ooxml', attributes: { 'table:protection-key': 'k' } },
      { standard: 'odf', attributes: { password: 'CC1A' } },
      { standard: 'ooxml', attributes: { password: 3 } },
      { standard: 'ooxml', attributes: { hashValue: 'h'.repeat(1025) } },
      { standard: 'ooxml', attributes: [] },
    ])
      expect(isProtection({ ...sheetGuard, kept }, 'p2', base), JSON.stringify(kept)).toBe(false);
    // A range's protection never holds a file's: only a protected sheet is read with one.
    expect(isProtection({ ...guard, kept: xlsx }, 'p1', base)).toBe(false);
  });
});

describe('protectedBoxes', () => {
  it('gives the boxes to hatch: ranges the viewer may not write freely, and a sheet less its exceptions', () => {
    const warn = { ...guard, id: 'p3', can: 'warn' as const, range: range(8, 4, 9, 5) };
    const layout = withGuards(guard, warn);
    expect(protectedBoxes(layout, editor)).toEqual([{ r1: 8, c1: 4, r2: 9, c2: 5 }]);
    expect(protectedBoxes(layout, participant)).toEqual([
      { r1: 2, c1: 1, r2: 4, c2: 2 },
      { r1: 8, c1: 4, r2: 9, c2: 5 },
    ]);
    // A sheet less its exception: the top row is open, two rows inside it the middle columns too.
    const sheet = withGuards({
      id: 'p2',
      can: 'owner',
      except: [range(0, 0, 0, 5), range(4, 2, 5, 3)],
    });
    expect(protectedBoxes(sheet, owner)).toEqual([]);
    expect(protectedBoxes(sheet, editor)).toEqual([
      { r1: 1, c1: 0, r2: 3, c2: 5 },
      { r1: 6, c1: 0, r2: 9, c2: 5 },
      { r1: 4, c1: 0, r2: 5, c2: 1 },
      { r1: 4, c1: 4, r2: 5, c2: 5 },
    ]);
    expect(
      protectedBoxes(withGuards({ ...guard, range: { ...guard.range!, r1: 'gone' } }), participant),
    ).toEqual([]);
    expect(protectedBoxes(base, participant)).toEqual([]);
    // An exception over every cell leaves nothing; one whose cells are gone takes nothing away.
    const open = (x: IdRange[]) => withGuards({ id: 'p6', can: 'editors', except: x });
    expect(protectedBoxes(open([range(0, 0, 9, 5)]), participant)).toEqual([]);
    expect(protectedBoxes(open([{ ...range(0, 0, 0, 0), r1: 'gone' }]), participant)).toEqual([
      { r1: 0, c1: 0, r2: 9, c2: 5 },
    ]);
    expect(protectedBoxes(withGuards({ id: 'p7', can: 'owner' }), editor)).toEqual([
      { r1: 0, c1: 0, r2: 9, c2: 5 },
    ]);
    expect(protectedBoxes(open([range(0, 0, 0, 0), range(9, 5, 9, 5)]), participant)).toHaveLength(
      3,
    );
    expect(protectedBoxes(open([range(9, 5, 9, 5)]), participant)).toEqual([
      { r1: 0, c1: 0, r2: 8, c2: 5 },
      { r1: 9, c1: 0, r2: 9, c2: 4 },
    ]);
  });
});
