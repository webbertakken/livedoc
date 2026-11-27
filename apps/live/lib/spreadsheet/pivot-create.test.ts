// Create Pivot Table's fields (docs/specs/029-sheets/pivot-tables.md "Making one"): the Data Range it opens with and
// what Create reads from them, refusals word for word.
import { describe, expect, it } from 'vitest';
import { emptyLayout, sheetFromJson, Workbook, type SheetJson } from '@livedoc/sheets';
import {
  newSheetPivot,
  PIVOT_HEADER_WHY,
  PIVOT_LOCATION_WHY,
  PIVOT_RANGE_WHY,
  pivotCreateStart,
  pivotRangeText,
  readPivotCreate,
  sourceFor,
} from './pivot-create';

let seq = 11;
const rand = () => ((seq = (seq * 16807) % 2147483647) - 1) / 2147483646;
const by = { id: 'me', name: 'Me', color: '#000000' };

function sheetJson(id: string, title: string, values: Record<string, string>): SheetJson {
  const layout = emptyLayout(rand, 8, 5);
  return {
    id,
    tabId: `tab${id}`,
    title,
    layout,
    cells: Object.entries(values).map(([a1, s]) => ({
      r: layout.rows[Number(a1.slice(1)) - 1]!,
      c: layout.cols[a1.charCodeAt(0) - 65]!,
      i: { s },
    })),
    rev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: by,
  };
}

function setup() {
  const data = sheetFromJson(
    sheetJson('sheetData', 'Data', { A1: 'Region', B1: 'Units', A2: 'East', B2: 'x', A3: 'West' }),
  );
  const other = sheetFromJson(sheetJson('sheetOther', 'My Sheet', {}));
  const wb = new Workbook({ sheets: [data, other], locale: 'en-GB' });
  return { wb, data, other, ctx: wb.ctxFor(data.id) };
}

describe('the Data Range Create Pivot Table opens with', () => {
  it('is the data region round the active cell, or the selection, with its sheet’s name', () => {
    const { wb, data } = setup();
    const one = { r1: 1, c1: 0, r2: 1, c2: 0 };
    expect(pivotCreateStart(wb, data, { ranges: [one], active: { r: 1, c: 0 } })).toBe(
      'Data!A1:B3',
    );
    const picked = { r1: 0, c1: 0, r2: 1, c2: 1 };
    expect(pivotCreateStart(wb, data, { ranges: [picked], active: { r: 0, c: 0 } })).toBe(
      'Data!A1:B2',
    );
    const empty = { r1: 6, c1: 4, r2: 6, c2: 4 };
    expect(pivotCreateStart(wb, data, { ranges: [empty], active: { r: 6, c: 4 } })).toBe('');
  });

  it('quotes a name that needs it, and is empty for a range no longer there', () => {
    const { other } = setup();
    const { rows, cols } = other.layout;
    expect(pivotRangeText(other, { r1: rows[0]!, c1: cols[0]!, r2: rows[1]!, c2: cols[1]! })).toBe(
      "'My Sheet'!A1:B2",
    );
    expect(pivotRangeText(other, { r1: 'gone', c1: cols[0]!, r2: rows[1]!, c2: cols[1]! })).toBe(
      '',
    );
  });
});

describe('Create', () => {
  it('reads a range on any sheet into a new sheet or an existing sheet’s cell', () => {
    const { ctx, data, other } = setup();
    const { rows, cols } = data.layout;
    const source = { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[1]! };
    expect(readPivotCreate(ctx, 'A1:B3', 'new', '')).toEqual({
      ok: true,
      sourceSheetId: data.id,
      source,
      to: { kind: 'new' },
    });
    expect(readPivotCreate(ctx, ' Data!A1:B3 ', 'existing', "'My Sheet'!C4:D5")).toEqual({
      ok: true,
      sourceSheetId: data.id,
      source,
      to: {
        kind: 'existing',
        sheetId: other.id,
        at: { r: other.layout.rows[3], c: other.layout.cols[2] },
      },
    });
    expect(readPivotCreate(ctx, "'My Sheet'!A1:A2", 'existing', 'E1')).toMatchObject({
      ok: true,
      sourceSheetId: other.id,
      to: { sheetId: data.id },
    });
  });

  it('refuses a range that does not read or has no row of data, and a location that does not read', () => {
    const { ctx } = setup();
    for (const bad of ['', 'A1:', 'Nope!A1:B3', 'A1:Z99'])
      expect(readPivotCreate(ctx, bad, 'new', '')).toEqual({
        ok: false,
        field: 'range',
        why: PIVOT_RANGE_WHY,
      });
    expect(readPivotCreate(ctx, 'A1:B1', 'new', '')).toEqual({
      ok: false,
      field: 'range',
      why: PIVOT_HEADER_WHY,
    });
    for (const bad of ['', 'Nope!A1', 'H99'])
      expect(readPivotCreate(ctx, 'A1:B3', 'existing', bad)).toEqual({
        ok: false,
        field: 'location',
        why: PIVOT_LOCATION_WHY,
      });
  });

  it('makes a pivot table with no fields, its source by id on another sheet', () => {
    const plan = { sourceSheetId: 'sheetData', source: { r1: 'a', c1: 'b', r2: 'c', c2: 'd' } };
    expect(newSheetPivot('pivot01', 'sheetNew', { r: 'r', c: 'c' }, plan)).toEqual({
      id: 'pivot01',
      kind: 'pivot',
      at: { r: 'r', c: 'c' },
      source: { ...plan.source, s: 'sheetData' },
    });
    expect(sourceFor('sheetData', 'sheetData', plan.source)).toEqual(plan.source);
  });
});
