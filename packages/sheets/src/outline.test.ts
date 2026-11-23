// docs/specs/029-sheets/grid-and-editing.md "Groups and the outline" (D159, D161, D164): groups as depths, Google's
// addDimensionGroup and deleteDimensionGroup cases, collapsing, and what inserting, deleting, moving and sorting do.
import { describe, expect, it } from 'vitest';
import { gridLayout } from './testing/book';
import { insertAxis, deleteAxis, moveAxis } from './commands-axis';
import { layoutIndex } from './layout';
import {
  collapseAll,
  collapseGroup,
  groupLines,
  OUTLINE_DEPTH_REFUSAL,
  setControls,
  ungroupLines,
} from './outline-commands';
import { controlLine, foldTargets, outlineOf, type OutlineAxis } from './outline';
import { emptySheet, type Sheet } from './sheet';
import { applySheetWrite, inverseSheetWrite, type SheetWrite } from './store';
import { validateWrite } from './validate';

const ctx = { now: 1, by: { id: '', name: '', color: '#000000' } };
const room = { rows: 100, cols: 100 };
const seeded = () => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

// A sheet of 12 rows and 6 columns, with each write's undo kept to check it lands back where it was.
function sheetOf() {
  let sheet: Sheet = emptySheet({
    id: 'sheet0001',
    tabId: 't',
    title: 'S',
    layout: gridLayout('tt', 12, 6),
  });
  const undos: SheetWrite[] = [];
  const run = (w: SheetWrite | { refused: string } | null) => {
    if (!w || 'refused' in w) throw new Error('no write');
    const r = applySheetWrite(sheet, w, ctx);
    undos.push(inverseSheetWrite(sheet, r));
    sheet = r.sheet;
  };
  const undo = () => {
    sheet = applySheetWrite(sheet, undos.pop()!, ctx).sheet;
  };
  const groups = (axis: OutlineAxis = 'r') =>
    outlineOf(sheet.layout, axis).groups.map(
      (g) => `${g.depth}:${g.from}-${g.to}${g.collapsed ? '+' : ''}`,
    );
  return { s: () => sheet, run, undo, groups };
}

describe('grouping (Google addDimensionGroup)', () => {
  it('groups lines, nests inside, extends over an edge and joins touching groups', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 2, 5));
    expect(t.groups()).toEqual(['1:2-5']);
    // Inside: nested one deeper.
    t.run(groupLines(t.s(), 'r', 3, 4));
    expect(t.groups()).toEqual(['1:2-5', '2:3-4']);
    // Over an edge: the outer extends, the overlap nests.
    t.run(groupLines(t.s(), 'r', 5, 7));
    expect(t.groups()).toEqual(['1:2-7', '2:3-5']);
    // Touching: one group.
    t.run(groupLines(t.s(), 'r', 8, 9));
    expect(t.groups()).toEqual(['1:2-9', '2:3-5']);
    t.undo();
    expect(t.groups()).toEqual(['1:2-7', '2:3-5']);
  });

  it('refuses a line past seven deep (D159), and nothing outside the sheet', () => {
    const t = sheetOf();
    for (let i = 0; i < 7; i++) t.run(groupLines(t.s(), 'c', 1, 2));
    expect(t.groups('c')).toHaveLength(7);
    expect(groupLines(t.s(), 'c', 0, 1)).toEqual({ refused: OUTLINE_DEPTH_REFUSAL });
    expect(OUTLINE_DEPTH_REFUSAL).toBe('Groups nest at most 7 deep');
    expect(groupLines(t.s(), 'c', 40, 50)).toBeNull();
  });

  it('carries a collapsed group wholly inside to its new depth', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 3, 5));
    t.run(collapseGroup(t.s(), 'r', outlineOf(t.s().layout, 'r').groups[0]!, true));
    t.run(groupLines(t.s(), 'r', 2, 6));
    expect(t.groups()).toEqual(['1:2-6', '2:3-5+']);
    // Partly over it: it extends and stays collapsed at its depth.
    t.run(groupLines(t.s(), 'r', 0, 3));
    expect(t.groups()).toEqual(['1:0-6', '2:2-5+', '3:3-3']);
  });
});

describe('ungrouping (Google deleteDimensionGroup)', () => {
  it('takes one from each line, leaves lines in no group, and does nothing over none', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 2, 6));
    t.run(groupLines(t.s(), 'r', 3, 4));
    t.run(ungroupLines(t.s(), 'r', 0, 3));
    expect(t.groups()).toEqual(['1:3-6', '2:4-4']);
    expect(ungroupLines(t.s(), 'r', 8, 11)).toBeNull();
    expect(ungroupLines(t.s(), 'r', 20, 30)).toBeNull();
    t.undo();
    expect(t.groups()).toEqual(['1:2-6', '2:3-4']);
  });

  it('keeps a collapsed group collapsed: shallower when wholly ungrouped, on a kept line when partly', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 2, 7));
    t.run(groupLines(t.s(), 'r', 3, 5));
    const inner = () => outlineOf(t.s().layout, 'r').groups.find((g) => g.depth === 2)!;
    t.run(collapseGroup(t.s(), 'r', inner(), true));
    t.run(ungroupLines(t.s(), 'r', 3, 5));
    expect(t.groups()).toEqual(['1:2-7+']);
    t.undo();
    expect(t.groups()).toEqual(['1:2-7', '2:3-5+']);
    // Ungrouping the marked first line: the mark moves to the group's next line.
    t.run(ungroupLines(t.s(), 'r', 3, 3));
    expect(t.groups()).toEqual(['1:2-7', '2:4-5+']);
    // Ungrouping the outer group's first two lines while it is collapsed: marked on a kept line, before or after.
    const outer = sheetOf();
    outer.run(groupLines(outer.s(), 'r', 2, 7));
    outer.run(collapseGroup(outer.s(), 'r', outlineOf(outer.s().layout, 'r').groups[0]!, true));
    outer.run(ungroupLines(outer.s(), 'r', 2, 3));
    expect(outer.groups()).toEqual(['1:4-7+']);
    outer.run(collapseAll(outer.s(), 'r', false));
    outer.run(groupLines(outer.s(), 'r', 2, 3));
    outer.run(collapseGroup(outer.s(), 'r', outlineOf(outer.s().layout, 'r').groups[0]!, true));
    // The mark sits on line 2; ungrouping 2 to 3 of a group 2 to 7 moves it after the span.
    outer.run(ungroupLines(outer.s(), 'r', 2, 3));
    expect(outer.groups()).toEqual(['1:4-7+']);
    // Wholly ungrouped at depth 1: the mark goes.
    outer.run(ungroupLines(outer.s(), 'r', 0, 11));
    expect(outer.s().layout.rowCollapsed).toBeUndefined();
    expect(outer.s().layout.rowDepth).toBeUndefined();
  });

  it('moves the mark to the group’s first line when the span starts inside it', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 2, 7));
    // Mark on line 5 (collapse from the far end), then ungroup 4 to 7.
    t.run({
      kind: 'layout',
      changes: [{ k: 'collapse', axis: 'r', at: t.s().layout.rows[5]!, depth: 1, collapsed: true }],
    });
    t.run(ungroupLines(t.s(), 'r', 4, 7));
    expect(t.groups()).toEqual(['1:2-3+']);
    expect(t.s().layout.rowCollapsed).toEqual([{ at: t.s().layout.rows[2], depth: 1 }]);
  });
});

describe('marks that name no group', () => {
  it('are passed over by grouping, ungrouping and reading, and a mark kept clear of the span stays', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 1, 2));
    t.run(groupLines(t.s(), 'r', 5, 6));
    expect(t.groups()).toEqual(['1:1-2', '1:5-6']);
    const rows = t.s().layout.rows;
    const stray = {
      ...t.s(),
      layout: {
        ...t.s().layout,
        // A line gone from the sheet, and a depth no group has there.
        rowCollapsed: [
          { at: 'gone', depth: 1 },
          { at: rows[1]!, depth: 3 },
          { at: rows[5]!, depth: 1 },
        ],
      },
    };
    expect(outlineOf(stray.layout, 'r').groups.map((g) => g.collapsed)).toEqual([false, true]);
    const grouped = groupLines(stray, 'r', 0, 3) as SheetWrite;
    expect(grouped.kind === 'layout' && grouped.changes).toHaveLength(1);
    const ungrouped = ungroupLines(stray, 'r', 1, 1) as SheetWrite;
    expect(ungrouped.kind === 'layout' && ungrouped.changes).toHaveLength(1);
    // A collapsed group partly ungrouped away from its marked line keeps its mark.
    const kept = ungroupLines(stray, 'r', 6, 6) as SheetWrite;
    expect(kept.kind === 'layout' && kept.changes).toHaveLength(1);
  });

  it('undo a collapse that changed nothing with nothing', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 1, 2));
    t.run(collapseAll(t.s(), 'r', true));
    const at = t.s().layout.rows[1]!;
    const same = {
      kind: 'layout' as const,
      changes: [{ k: 'collapse' as const, axis: 'r' as const, at, depth: 1, collapsed: true }],
    };
    const r = applySheetWrite(t.s(), same, ctx);
    expect(inverseSheetWrite(t.s(), r)).toEqual({ kind: 'layout', changes: [] });
  });
});

describe('collapsing', () => {
  it('collapses and expands a group, its lines hidden but not hidden by hand', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'c', 1, 2));
    const g = () => outlineOf(t.s().layout, 'c').groups[0]!;
    t.run(collapseGroup(t.s(), 'c', g(), true));
    expect(collapseGroup(t.s(), 'c', g(), true)).toBeNull();
    const ix = layoutIndex(t.s().layout);
    expect([...ix.hiddenCols]).toEqual(t.s().layout.cols.slice(1, 3));
    expect(ix.handHiddenCols.size).toBe(0);
    t.run(collapseGroup(t.s(), 'c', g(), false));
    expect(t.groups('c')).toEqual(['1:1-2']);
    expect(collapseGroup(t.s(), 'c', g(), false)).toBeNull();
  });

  it('keeps an inner group’s fold while the outer one collapses and expands', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 1, 6));
    t.run(groupLines(t.s(), 'r', 2, 3));
    const [outer, inner] = outlineOf(t.s().layout, 'r').groups;
    t.run(collapseGroup(t.s(), 'r', inner!, true));
    t.run(collapseGroup(t.s(), 'r', outer!, true));
    t.run(collapseGroup(t.s(), 'r', outlineOf(t.s().layout, 'r').groups[0]!, false));
    expect(t.groups()).toEqual(['1:1-6', '2:2-3+']);
  });

  it('collapses and expands all, and nothing when nothing changes', () => {
    const t = sheetOf();
    expect(collapseAll(t.s(), 'r', true)).toBeNull();
    expect(collapseAll(t.s(), 'r', false)).toBeNull();
    t.run(groupLines(t.s(), 'r', 1, 6));
    t.run(groupLines(t.s(), 'r', 2, 3));
    t.run(collapseAll(t.s(), 'r', true));
    expect(t.groups()).toEqual(['1:1-6+', '2:2-3+']);
    t.run(collapseAll(t.s(), 'r', false));
    expect(t.groups()).toEqual(['1:1-6', '2:2-3']);
    t.undo();
    expect(t.groups()).toEqual(['1:1-6+', '2:2-3+']);
  });

  it('moves the controls after their groups and back', () => {
    const t = sheetOf();
    expect(setControls(t.s(), 'r', false)).toBeNull();
    t.run(setControls(t.s(), 'r', true));
    expect(t.s().layout.controlsAfter).toEqual({ r: true });
    expect(setControls(t.s(), 'r', true)).toBeNull();
    t.run(setControls(t.s(), 'c', true));
    t.run(setControls(t.s(), 'r', false));
    expect(t.s().layout.controlsAfter).toEqual({ c: true });
    t.undo();
    expect(t.s().layout.controlsAfter).toEqual({ r: true, c: true });
    t.run(setControls(t.s(), 'c', false));
    t.run(setControls(t.s(), 'r', false));
    expect(t.s().layout.controlsAfter).toBeUndefined();
  });
});

describe('the keys’ targets (D161) and the controls', () => {
  it('collapse the innermost expanded group, expand the collapsed ones or those controlled here', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 2, 6));
    t.run(groupLines(t.s(), 'r', 3, 4));
    expect(foldTargets(t.s().layout, 'r', 3).collapse).toMatchObject({ depth: 2 });
    expect(foldTargets(t.s().layout, 'r', 9)).toEqual({ collapse: null, expand: [] });
    t.run(collapseAll(t.s(), 'r', true));
    expect(foldTargets(t.s().layout, 'r', 3).expand.map((g) => g.depth)).toEqual([1, 2]);
    // Line 1 holds the outer group's control (before it).
    expect(foldTargets(t.s().layout, 'r', 1).expand.map((g) => g.depth)).toEqual([1]);
    t.run(setControls(t.s(), 'r', true));
    expect(foldTargets(t.s().layout, 'r', 7).expand.map((g) => g.depth)).toEqual([1]);
  });

  it('sit before a group, after it when it starts the sheet or the sheet asks', () => {
    const g = { depth: 1, from: 3, to: 5, collapsed: false };
    expect(controlLine(g, false)).toBe(2);
    expect(controlLine(g, true)).toBe(6);
    expect(controlLine({ ...g, from: 0 }, false)).toBe(6);
  });
});

describe('lines inserted, deleted, moved and sorted (D164)', () => {
  it('joins lines inserted between two grouped lines, at the lesser depth', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 2, 6));
    t.run(groupLines(t.s(), 'r', 3, 4));
    t.run(insertAxis(t.s(), 'r', 4, 2, 'before', room, seeded()));
    expect(t.groups()).toEqual(['1:2-8', '2:3-6']);
    t.run(insertAxis(t.s(), 'r', 3, 1, 'before', room, seeded()));
    expect(t.groups()).toEqual(['1:2-9', '2:4-7']);
    // At either edge: outside.
    t.run(insertAxis(t.s(), 'r', 2, 1, 'before', room, seeded()));
    t.run(insertAxis(t.s(), 'r', 0, 1, 'before', room, seeded()));
    expect(t.groups()).toEqual(['1:4-11', '2:6-9']);
    t.undo();
    t.undo();
    t.undo();
    t.undo();
    expect(t.groups()).toEqual(['1:2-6', '2:3-4']);
  });

  it('drops deleted lines’ depths, moves a mark off a deleted line, and undoes both', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 2, 6));
    t.run(collapseGroup(t.s(), 'r', outlineOf(t.s().layout, 'r').groups[0]!, true));
    t.run(deleteAxis(t.s(), 'r', 2, 3));
    expect(t.groups()).toEqual(['1:2-4+']);
    t.undo();
    expect(t.groups()).toEqual(['1:2-6+']);
    // The mark on the group's last line moves back to the line before it.
    t.run({
      kind: 'layout',
      changes: [
        { k: 'collapse', axis: 'r', at: t.s().layout.rows[2]!, depth: 1, collapsed: false },
      ],
    });
    t.run({
      kind: 'layout',
      changes: [{ k: 'collapse', axis: 'r', at: t.s().layout.rows[6]!, depth: 1, collapsed: true }],
    });
    t.run(deleteAxis(t.s(), 'r', 6, 6));
    expect(t.groups()).toEqual(['1:2-5+']);
    // Deleting the whole group takes its mark with it.
    t.run(deleteAxis(t.s(), 'r', 2, 5));
    expect(t.s().layout.rowDepth).toBeUndefined();
    expect(t.s().layout.rowCollapsed).toBeUndefined();
  });

  it('leaves groups where they stood when lines move, and a move’s undo puts all back', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'c', 1, 2));
    t.run(collapseAll(t.s(), 'c', true));
    t.run(moveAxis(t.s(), 'c', 1, 1, 5));
    expect(t.groups('c')).toEqual(['1:1-2+']);
    t.undo();
    expect(t.groups('c')).toEqual(['1:1-2+']);
    expect(t.s().layout.colDepth).toEqual({ ttc1: 1, ttc2: 1 });
    // A sheet with no groups moves as before.
    const plain = sheetOf();
    plain.run(moveAxis(plain.s(), 'r', 0, 0, 3));
    expect(plain.s().layout.rowDepth).toBeUndefined();
  });

  it('leaves groups where they stood when lines are sorted', () => {
    const t = sheetOf();
    t.run(groupLines(t.s(), 'r', 1, 2));
    const rows = t.s().layout.rows;
    t.run({ kind: 'layout', changes: [{ k: 'orderRows', ids: [rows[2]!, rows[1]!, rows[0]!] }] });
    expect(t.groups()).toEqual(['1:1-2']);
    // A stray mark on a line no longer on the sheet is passed over.
    const stray = {
      ...t.s(),
      layout: { ...t.s().layout, rowCollapsed: [{ at: 'gone', depth: 1 }] },
    };
    const sorted = applySheetWrite(
      stray,
      { kind: 'layout', changes: [{ k: 'orderRows', ids: [rows[1]!, rows[2]!] }] },
      ctx,
    );
    expect(sorted.sheet.layout.rowCollapsed).toEqual([]);
  });
});

describe('the changes on the wire', () => {
  it('accepts depths, collapses and controls, and refuses bad ones', () => {
    const t = sheetOf();
    const id = t.s().layout.rows[1]!;
    const check = (ch: unknown) =>
      validateWrite(t.s(), { kind: 'layout', changes: [ch as never] }).ok;
    expect(check({ k: 'depth', axis: 'r', depths: { [id]: 7 } })).toBe(true);
    expect(check({ k: 'depth', axis: 'r', depths: { [id]: 8 } })).toBe(false);
    expect(check({ k: 'depth', axis: 'r', depths: { 'not an id': 1 } })).toBe(false);
    expect(check({ k: 'depth', axis: 'x', depths: {} })).toBe(false);
    expect(check({ k: 'depth', axis: 'r', depths: [] })).toBe(false);
    expect(check({ k: 'collapse', axis: 'r', at: id, depth: 1, collapsed: true })).toBe(true);
    expect(check({ k: 'collapse', axis: 'r', at: id, depth: 0, collapsed: true })).toBe(false);
    expect(check({ k: 'collapse', axis: 'r', at: 'no id!', depth: 1, collapsed: true })).toBe(
      false,
    );
    expect(check({ k: 'controls', axis: 'c', after: true })).toBe(true);
    expect(check({ k: 'controls', axis: 'c', after: 1 })).toBe(false);
  });

  it('passes over lines no longer on the sheet, and a collapse already so', () => {
    const t = sheetOf();
    const before = t.s().layout;
    const r = applySheetWrite(
      t.s(),
      {
        kind: 'layout',
        changes: [
          { k: 'depth', axis: 'r', depths: { gone: 2 } },
          { k: 'collapse', axis: 'r', at: 'gone', depth: 1, collapsed: true },
          { k: 'collapse', axis: 'r', at: before.rows[0]!, depth: 1, collapsed: false },
        ],
      },
      ctx,
    );
    expect(r.sheet.layout.rowDepth).toBeUndefined();
    expect(r.sheet.layout.rowCollapsed).toBeUndefined();
  });
});
