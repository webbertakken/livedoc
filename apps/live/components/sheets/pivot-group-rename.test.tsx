// @vitest-environment jsdom
// Renaming a pivot table's custom group by typing over its cell (docs/specs/029-sheets/pivot-tables.md "Grouping in the
// grid", Webber's ruling 2026-11-28): an Editor's, one undo step, refused with its words; every other output cell, and
// everyone else's typing, refused as before.
import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SheetPivot } from '@livedoc/sheets';
import {
  GROUP_NAME_EMPTY,
  GROUP_NAME_TAKEN,
  GROUP_NAME_TOO_LONG,
} from '@/lib/spreadsheet/pivot-group-rename';
import type { SheetActions } from './useSheetActions';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from './sheet-ui-test-utils';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

beforeAll(stubResizeObserver);
afterEach(cleanup);

const DATA = {
  A1: 'Region',
  B1: 'Units',
  A2: 'East',
  B2: '5',
  A3: 'West',
  B3: '3',
  A4: 'North',
  B4: '2',
};
const pivotOf = (h: SheetHarness) =>
  (h.store.sheet(SHEET_ID)!.layout.objects ?? []).find((x): x is SheetPivot => x.kind === 'pivot')!;
const groupNames = (h: SheetHarness) => {
  const g = pivotOf(h).rows![0]!.grouping;
  return g?.k === 'custom' ? g.groups.map((x) => x.name) : [];
};

// The pivot table at E1 over A1:B4, its rows East and West gathered into Group 1, North into Far.
async function setup(opts: { canShape?: boolean } = {}) {
  const h = await makeSheet({ rows: 12, cols: 10, cells: DATA });
  const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
  const pivot: SheetPivot = {
    id: 'pivot01',
    kind: 'pivot',
    at: { r: rows[0]!, c: cols[4]! },
    source: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[1]! },
    rows: [
      {
        col: cols[0]!,
        grouping: {
          k: 'custom',
          groups: [
            { name: 'Group 1', items: ['East', 'West'] },
            { name: 'Far', items: ['North'] },
          ],
        },
      },
    ],
    values: [{ col: cols[1]!, summary: 'SUM' }],
  };
  let actions: SheetActions | null = null;
  renderSheet(
    h,
    ({ actions: a }) => {
      actions = a;
      return null;
    },
    opts,
  );
  act(() => {
    h.store.write(SHEET_ID, {
      kind: 'layout',
      changes: [{ k: 'object', id: pivot.id, object: pivot }],
    });
  });
  // Types `text` over `cell` and commits it with Enter.
  const type = (cell: string, text: string) => {
    act(() => h.select(cell));
    act(() => actions!.startEdit('type', text));
    let out: ReturnType<SheetActions['commitEdit']> = { ok: true };
    act(() => {
      out = actions!.commitEdit('down');
    });
    return out;
  };
  return { h, type };
}

// E1 "Region" header ... E2 Far, E3 Group 1 (sorted A to Z), E4 Grand Total.
const cellOf = (h: SheetHarness, name: string) => {
  for (const r of [2, 3, 4]) if (h.value(`E${r}`) === name) return `E${r}`;
  throw new Error(`no cell shows ${name}`);
};

describe('typing over a custom group’s cell', () => {
  it('renames the group, trimmed, as one change', async () => {
    const { h, type } = await setup();
    vi.mocked(track).mockClear();
    expect(type(cellOf(h, 'Group 1'), '  Coast ')).toEqual({ ok: true });
    expect(groupNames(h)).toEqual(['Coast', 'Far']);
    expect(vi.mocked(track).mock.calls).toEqual([['Sheet', 'Changed', 'PivotTable']]);
  });

  it('refuses an empty name, one too long and another group’s, with its words', async () => {
    const { h, type } = await setup();
    const at = cellOf(h, 'Group 1');
    expect(type(at, '  ')).toMatchObject({ ok: false, message: GROUP_NAME_EMPTY });
    expect(type(at, 'x'.repeat(201))).toMatchObject({ ok: false, message: GROUP_NAME_TOO_LONG });
    expect(type(at, 'far')).toMatchObject({ ok: false, message: GROUP_NAME_TAKEN });
    expect(groupNames(h)).toEqual(['Group 1', 'Far']);
  });

  it('writes nothing for the same name', async () => {
    const { h, type } = await setup();
    const before = pivotOf(h);
    expect(type(cellOf(h, 'Group 1'), 'Group 1')).toEqual({ ok: true });
    expect(pivotOf(h)).toBe(before);
  });

  it('refuses typing over any other output cell as before', async () => {
    const { h, type } = await setup();
    type('F3', '9');
    expect(h.toast).toHaveBeenCalledWith("You can't edit a pivot table's cells");
    expect(groupNames(h)).toEqual(['Group 1', 'Far']);
  });

  it('is an Editor’s alone', async () => {
    const { h, type } = await setup({ canShape: false });
    type(cellOf(h, 'Group 1'), 'Coast');
    expect(groupNames(h)).toEqual(['Group 1', 'Far']);
  });
});
