// The outline bar's placement (grid-and-editing.md "Groups and the outline", D162, D165).
import { describe, expect, it } from 'vitest';
import type { SheetLayout } from '@livedoc/sheets';
import { geometryOf } from './sheet-geometry';
import { outlineMarks } from './sheet-outline-bar';

// 10 rows of 20 px and 4 columns of 100 px, ids row0.. and col0...
function layoutOf(extra: Partial<SheetLayout> = {}): SheetLayout {
  const rows = Array.from({ length: 10 }, (_, i) => `row${i}`);
  const cols = Array.from({ length: 4 }, (_, i) => `col${i}`);
  return {
    rows,
    cols,
    rowSize: Object.fromEntries(rows.map((id) => [id, 20])),
    colSize: Object.fromEntries(cols.map((id) => [id, 100])),
    ...extra,
  };
}
const at0 = { top: 0, left: 0 };
const marks = (layout: SheetLayout, scroll = at0, length = 400, axis: 'r' | 'c' = 'r') =>
  outlineMarks(geometryOf(layout), layout, axis, scroll, length);

describe('outlineMarks', () => {
  it('runs a bracket from the control on the line before to the far end, a lane a depth', () => {
    const layout = layoutOf({ rowDepth: { row3: 1, row4: 2, row5: 1 } });
    const [outer, inner] = marks(layout);
    expect(outer).toMatchObject({
      lane: 2,
      control: 50,
      bracket: { from: 50, to: 120, tickAt: 'to' },
    });
    expect(inner).toMatchObject({ lane: 14, control: 70, bracket: { from: 70, to: 100 } });
  });

  it('puts the control after a group starting the sheet, or when the sheet asks', () => {
    const first = marks(layoutOf({ rowDepth: { row0: 1, row1: 1 } }))[0]!;
    expect(first).toMatchObject({ control: 50, bracket: { from: 0, to: 50, tickAt: 'from' } });
    const asked = marks(layoutOf({ rowDepth: { row3: 1 }, controlsAfter: { r: true } }))[0]!;
    expect(asked.control).toBe(90);
  });

  it('draws a collapsed group as its control alone, and none inside it', () => {
    const layout = layoutOf({
      rowDepth: { row3: 1, row4: 2, row5: 1 },
      rowCollapsed: [{ at: 'row3', depth: 1 }],
    });
    const out = marks(layout);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ bracket: null, control: 50, group: { collapsed: true } });
  });

  it('leaves out a group of every line (no control) once collapsed, and groups out of view', () => {
    const all = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`row${i}`, 1]));
    expect(marks(layoutOf({ rowDepth: all }))[0]).toMatchObject({ control: null });
    expect(marks(layoutOf({ rowDepth: all, rowCollapsed: [{ at: 'row0', depth: 1 }] }))).toEqual(
      [],
    );
    expect(marks(layoutOf({ rowDepth: { row8: 1 } }), at0, 100)).toEqual([]);
    expect(marks(layoutOf({ rowDepth: { row1: 1 } }), { top: 100, left: 0 })).toEqual([]);
  });

  it('keeps frozen lines in place as the rest scroll', () => {
    const out = marks(layoutOf({ rowDepth: { row1: 1, row2: 1 }, frozenRows: 2 }), {
      top: 20,
      left: 0,
    });
    expect(out[0]).toMatchObject({ control: 10, bracket: { from: 10, to: 40 } });
  });

  it('places column groups along the columns, scrolled with them', () => {
    const out = marks(layoutOf({ colDepth: { col2: 1 } }), { top: 0, left: 50 }, 400, 'c');
    expect(out[0]).toMatchObject({ control: 100, bracket: { from: 100, to: 250 } });
  });
});
