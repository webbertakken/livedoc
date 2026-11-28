// docs/specs/029-sheets/data-tools.md "Find and replace" (D455-D459): each case as Google's findReplace answered it
// (plans/assets/0020/research/google-find-replace-probe.ts).
import { describe, expect, it } from 'vitest';
import { book } from './testing/book';
import { applySheetWrite, type SheetWrite } from './store';
import { cellEditText } from './edit-text';
import {
  findMatches,
  findNext,
  findPattern,
  findPlaceFromText,
  findPlaceText,
  replaceMatches,
  type FindOptions,
  type FindPlace,
} from './find';
import { cellKey } from './sheet';
import type { Protection } from './protection';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };

// The probe's sheet: A1:E2 and a second sheet's A1.
const PROBE = {
  One: {
    A1: 'banana',
    B1: 'Apple',
    C1: '101',
    D1: '="a"&"b"',
    E1: 'A1 note',
    A2: 'apple pie',
    B2: '2024-01-05',
    // Google keeps `=SUM(C1:C1)` as `=SUM(C1)`; LiveDoc keeps what was typed.
    C2: '=SUM(C1)',
    D2: 'aaa',
    E2: '=HYPERLINK("http://a.example","link a")',
  },
  Two: { A1: 'banana two' },
};

function setup(spec: Record<string, Record<string, string>> = PROBE) {
  const b = book(spec, { rows: 6, cols: 6 });
  const ids = b.sheets.map((s) => s.id);
  const all: FindPlace[] = ids.map((sheetId) => ({ sheetId }));
  const apply = (edits: readonly { sheetId: string; write: SheetWrite }[]) => {
    for (const e of edits) {
      const i = b.sheets.findIndex((s) => s.id === e.sheetId);
      const r = applySheetWrite(b.sheets[i]!, e.write, ctx);
      b.sheets[i] = r.sheet;
      b.wb.updateSheet(r.sheet, e.write.kind === 'cells' ? r.touched : undefined);
    }
  };
  const text = (a1: string, sheet = 0) => {
    const s = b.sheets[sheet]!;
    const c = a1.charCodeAt(0) - 65;
    const r = Number(a1.slice(1)) - 1;
    const cell = s.cells.get(cellKey(s.layout.rows[r]!, s.layout.cols[c]!));
    return cellEditText(cell, b.wb.ctxFor(s.id), 'en-GB');
  };
  const replace = (find: string, by: string, opts: FindOptions = {}, places = all) => {
    const pattern = findPattern(find, opts);
    if (!pattern || 'refused' in pattern) throw new Error('no pattern');
    const done = replaceMatches(b.wb, places, pattern, by, { formulas: true, caller: null });
    apply(done.edits);
    return done;
  };
  return { b, ids, all, apply, text, replace };
}

describe('findPattern', () => {
  it('is null for an empty search', () => {
    expect(findPattern('', {})).toBeNull();
  });

  it('refuses a regular expression RE2 refuses', () => {
    expect(findPattern('(a', { regex: true })).toEqual({ refused: 'regex' });
    expect(findPattern('(a', {})).not.toEqual({ refused: 'regex' });
  });
});

describe('Replace All, as Google’s findReplace', () => {
  // inserted-objects.md "Images in a cell" (D631): a picture has no text to replace, even by a pattern matching none.
  it('leaves a cell’s picture alone', () => {
    const t = setup({ S: { A1: 'x' } });
    const s = t.b.sheets[0]!;
    const key = cellKey(s.layout.rows[1]!, s.layout.cols[0]!);
    t.b.sheets[0] = { ...s, cells: s.cells.copy().set(key, { input: { img: { id: 'img-1' } } }) };
    t.b.wb.updateSheet(t.b.sheets[0]);
    const done = t.replace('^$', 'X', { regex: true });
    expect(done.cells).toBe(0);
    expect(t.b.sheets[0].cells.get(key)).toEqual({ input: { img: { id: 'img-1' } } });
  });

  it('replaces case aside in typed values only, counting every match', () => {
    const t = setup();
    const done = t.replace('a', 'X');
    expect(done.instances).toBe(12);
    expect(done.cells).toBe(6);
    expect(done.sheets).toBe(2);
    expect(['A1', 'B1', 'E1', 'A2', 'D2'].map((a) => t.text(a))).toEqual([
      'bXnXnX',
      'Xpple',
      'X1 note',
      'Xpple pie',
      'XXX',
    ]);
    // A formula's result and its text stay without Also Search Within Formulas.
    expect(t.text('D1')).toBe('="a"&"b"');
    expect(t.text('A1', 1)).toBe('bXnXnX two');
  });

  it('keeps to the case with Match Case', () => {
    const t = setup();
    expect(t.replace('A', 'X', { matchCase: true }).instances).toBe(2);
    expect([t.text('B1'), t.text('E1'), t.text('A2')]).toEqual(['Xpple', 'X1 note', 'apple pie']);
  });

  it('replaces only whole cells with Match Entire Cell Contents', () => {
    const t = setup();
    expect(t.replace('apple', 'X', { entireCell: true }).instances).toBe(1);
    expect([t.text('B1'), t.text('A2')]).toEqual(['X', 'apple pie']);
  });

  it('reads RE2 with $n groups, case aside', () => {
    const t = setup();
    expect(t.replace('(a)(p)', '[$2$1]', { regex: true }).instances).toBe(2);
    expect([t.text('B1'), t.text('A2')]).toEqual(['[pA]ple', '[pa]ple pie']);
  });

  it('anchors ^ at the cell’s start', () => {
    const t = setup();
    expect(t.replace('^a', 'Z', { regex: true }).instances).toBe(4);
    expect([t.text('A1'), t.text('D2')]).toEqual(['banana', 'Zaa']);
  });

  it('matches a regular expression whole with Match Entire Cell Contents', () => {
    const t = setup();
    expect(t.replace('a+', 'Z', { regex: true, entireCell: true }).instances).toBe(1);
    expect([t.text('D2'), t.text('A1')]).toEqual(['Z', 'banana']);
  });

  it('reads $0 as the match, $$ as a dollar and a backslash as plain text (D456)', () => {
    const t = setup();
    t.replace('(an)', '<$0|\\1|$$>', { regex: true });
    expect(t.text('A1')).toBe('b<an|\\1|$><an|\\1|$>a');
  });

  it('replaces in a number’s and a date’s edit text, read again as typed', () => {
    const t = setup();
    expect(t.replace('1', '2').instances).toBe(4);
    expect([t.text('C1'), t.text('E1')]).toEqual(['202', 'A2 note']);
    expect(t.b.v('C1', 'One')).toBe(202);
    const t2 = setup();
    t2.replace('2024', '1999');
    expect(t2.text('B2')).toContain('1999');
    expect(t2.b.v('B2', 'One')).toBe(36165);
  });

  it('turns text replaced by a number into the number', () => {
    const t = setup();
    t.replace('^b.*', '42', { regex: true });
    expect(t.b.v('A1', 'One')).toBe(42);
    expect(t.b.v('A1', 'Two')).toBe(42);
  });

  it('replaces in a formula’s text with Also Search Within Formulas', () => {
    const t = setup();
    const done = t.replace('C1', 'D1', { inFormulas: true });
    expect(done.instances).toBe(1);
    expect(t.text('C2')).toBe('=SUM(D1)');
    expect(t.text('E1')).toBe('A1 note');
    const t2 = setup();
    t2.replace('example', 'test', { inFormulas: true });
    expect(t2.text('E2')).toBe('=HYPERLINK("http://a.test","link a")');
  });

  it('keeps to a sheet, or a range of it', () => {
    const t = setup();
    expect(t.replace('a', 'X', {}, [{ sheetId: t.ids[0]! }]).instances).toBe(9);
    expect(t.text('A1', 1)).toBe('banana two');
    const t2 = setup();
    const range = { r1: 0, c1: 1, r2: 1, c2: 1 };
    expect(t2.replace('a', 'X', {}, [{ sheetId: t2.ids[0]!, within: range }]).instances).toBe(1);
    expect([t2.text('B1'), t2.text('A1')]).toEqual(['Xpple', 'banana']);
  });

  it('empties a cell replaced whole by nothing', () => {
    const t = setup();
    expect(t.replace('aaa', '').instances).toBe(1);
    expect(t.text('D2')).toBe('');
  });

  it('leaves formulas to someone who may not change them, and protected cells (D458)', () => {
    const t = setup();
    const layout = t.b.sheets[0]!.layout;
    const range = {
      r1: layout.rows[0]!,
      c1: layout.cols[0]!,
      r2: layout.rows[0]!,
      c2: layout.cols[1]!,
    };
    const keep: Protection = { id: 'p1', range, can: 'editors' };
    t.apply([
      {
        sheetId: t.ids[0]!,
        write: { kind: 'layout', changes: [{ k: 'protection', id: 'p1', protection: keep }] },
      },
    ]);
    const pattern = findPattern('a', { inFormulas: true })!;
    if ('refused' in pattern) throw new Error('refused');
    const done = replaceMatches(t.b.wb, t.all, pattern, 'X', {
      formulas: false,
      caller: { owner: false, editor: false },
    });
    expect(done.protectedLeft).toBe(2);
    t.apply(done.edits);
    expect([t.text('A1'), t.text('B1'), t.text('D1')]).toEqual(['banana', 'Apple', '="a"&"b"']);
    expect(t.text('D2')).toBe('XXX');
  });
});

describe('findMatches', () => {
  it('finds what cells show, row by row, formulas’ results too', () => {
    const t = setup();
    const p = findPattern('ab', {})!;
    if ('refused' in p) throw new Error('refused');
    expect(findMatches(t.b.wb, t.all[0]!, p)).toEqual([{ r: 0, c: 3 }]);
  });

  it('finds in a formula’s text with Also Search Within Formulas', () => {
    const t = setup();
    const p = findPattern('SUM', { inFormulas: true })!;
    if ('refused' in p) throw new Error('refused');
    expect(findMatches(t.b.wb, t.all[0]!, p)).toEqual([{ r: 1, c: 2 }]);
    const without = findPattern('SUM', {})!;
    if ('refused' in without) throw new Error('refused');
    expect(findMatches(t.b.wb, t.all[0]!, without)).toEqual([]);
  });

  it('finds a link by its address with Also Search Within Links (D459)', () => {
    const t = setup();
    const p = findPattern('a.example', { inLinks: true })!;
    if ('refused' in p) throw new Error('refused');
    expect(findMatches(t.b.wb, t.all[0]!, p)).toEqual([{ r: 1, c: 4 }]);
    const without = findPattern('a.example', {})!;
    if ('refused' in without) throw new Error('refused');
    expect(findMatches(t.b.wb, t.all[0]!, without)).toEqual([]);
  });

  it('keeps to a range', () => {
    const t = setup();
    const p = findPattern('a', {})!;
    if ('refused' in p) throw new Error('refused');
    const within = { r1: 1, c1: 0, r2: 1, c2: 1 };
    expect(findMatches(t.b.wb, { sheetId: t.ids[0]!, within }, p)).toEqual([{ r: 1, c: 0 }]);
  });
});

describe('findNext (D457)', () => {
  const pen = () => {
    const t = setup({ One: { A1: 'pen', C2: 'pen' }, Two: { B1: 'pen' }, Three: { A3: 'pen' } });
    const p = findPattern('pen', {})!;
    if ('refused' in p) throw new Error('refused');
    return { ...t, p };
  };

  it('goes row by row, then to the next sheet, then loops back', () => {
    const t = pen();
    const [one, two, three] = t.ids as [string, string, string];
    expect(findNext(t.b.wb, t.all, { sheetId: one, r: 0, c: 0 }, t.p)).toEqual({
      sheetId: one,
      r: 1,
      c: 2,
      looped: false,
    });
    expect(findNext(t.b.wb, t.all, { sheetId: one, r: 1, c: 2 }, t.p)).toEqual({
      sheetId: two,
      r: 0,
      c: 1,
      looped: false,
    });
    expect(findNext(t.b.wb, t.all, { sheetId: three, r: 2, c: 0 }, t.p)).toEqual({
      sheetId: one,
      r: 0,
      c: 0,
      looped: true,
    });
  });

  it('loops on one sheet, finds itself when it is the only match, and gives null for none', () => {
    const t = pen();
    const one = [t.all[0]!];
    expect(findNext(t.b.wb, one, { sheetId: t.ids[0]!, r: 1, c: 2 }, t.p)).toMatchObject({
      r: 0,
      c: 0,
      looped: true,
    });
    const solo = [t.all[1]!];
    expect(findNext(t.b.wb, solo, { sheetId: t.ids[1]!, r: 0, c: 1 }, t.p)).toMatchObject({
      r: 0,
      c: 1,
      looped: true,
    });
    const none = findPattern('ink', {})!;
    if ('refused' in none) throw new Error('refused');
    expect(findNext(t.b.wb, t.all, { sheetId: t.ids[0]!, r: 0, c: 0 }, none)).toBeNull();
  });

  it('starts at the first place from a sheet the search does not reach', () => {
    const t = pen();
    expect(findNext(t.b.wb, [t.all[2]!], { sheetId: t.ids[0]!, r: 0, c: 0 }, t.p)).toEqual({
      sheetId: t.ids[2]!,
      r: 2,
      c: 0,
      looped: false,
    });
  });
});

describe('Specific Range text', () => {
  it('reads a range on its sheet or on the open one, and writes it back', () => {
    const t = setup();
    const ctx = t.b.wb.ctxFor(t.ids[0]!);
    expect(findPlaceFromText(ctx, 'Two!A1:B2')).toEqual({
      sheetId: t.ids[1],
      within: { r1: 0, c1: 0, r2: 1, c2: 1 },
    });
    expect(findPlaceFromText(ctx, 'B2')).toEqual({
      sheetId: t.ids[0],
      within: { r1: 1, c1: 1, r2: 1, c2: 1 },
    });
    expect(findPlaceFromText(ctx, 'Nowhere!A1')).toBeNull();
    expect(findPlaceFromText(ctx, 'Two!pen')).toBeNull();
    expect(findPlaceText('Sales 2026', { r1: 0, c1: 0, r2: 9, c2: 3 })).toBe("'Sales 2026'!A1:D10");
  });
});
