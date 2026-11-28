// A sheet's slicers as a file holds them (docs/specs/029-sheets/standard-mapping.md "Filters in the file", slicers):
// each by position, its default and the rest LiveDoc's record carries (slicer-record.ts), and the slicers a sheet
// makes of a file's. XLSX also writes and reads a slicer over a table as Excel's table slicer (xlsx-slicers.ts).
import type { GridRange } from '../address';
import { makeAxisIds, type Rand } from '../ids';
import { idRangeOf, posRangeOf } from '../layout';
import { OBJECT_OFFSET_MAX } from '../objects/object-checks';
import {
  sheetSlicers,
  SLICER_SIZE_MAX,
  SLICER_SIZE_MIN,
  SLICER_TITLE_MAX,
  SLICERS_MAX,
  type SheetSlicer,
} from '../objects/sheet-slicer';
import type { FilterCondition, SheetLayout } from '../sheet';
import type { FileLoss } from './workbook-file';

/**
 * A slicer as a file holds it: its cell and offsets, its size, its range and its column's place (absent once deleted),
 * its default, title and Apply to Pivot Tables, and (XLSX) its Excel table slicer's name.
 */
export type FileSlicer = {
  at: { r: number; c: number; dx: number; dy: number };
  width: number;
  height: number;
  range?: GridRange;
  c?: number;
  filter?: FilterCondition;
  title?: string;
  pivots?: false;
  name?: string;
};

/** A slicer's fields beside its place, as both the model and a file hold them. */
const optional = (x: Pick<SheetSlicer, 'filter' | 'title' | 'pivots'>) => ({
  ...(x.filter ? { filter: x.filter } : {}),
  ...(x.title ? { title: x.title } : {}),
  ...(x.pivots === false ? { pivots: false as const } : {}),
});

/** A sheet's slicers as a file holds them, in paint order; one whose cell is gone is left out. */
export function fileSlicersOf(layout: SheetLayout): FileSlicer[] {
  const rowPos = new Map(layout.rows.map((id, i) => [id, i]));
  const colPos = new Map(layout.cols.map((id, i) => [id, i]));
  return sheetSlicers(layout).flatMap((s): FileSlicer[] => {
    const r = rowPos.get(s.at.r);
    const c = colPos.get(s.at.c);
    if (r === undefined || c === undefined) return [];
    const range = s.range ? posRangeOf(layout, s.range) : null;
    const col = range && s.col !== undefined ? colPos.get(s.col) : undefined;
    return [
      {
        at: { r, c, dx: s.at.dx, dy: s.at.dy },
        width: s.width,
        height: s.height,
        ...(range ? { range } : {}),
        ...(col !== undefined ? { c: col } : {}),
        ...optional(s),
      },
    ];
  });
}

/** What a file's slicers are made with: the sheet's name, its id maker and the read's losses. */
export type SlicerMaking = { sheet: string; rand: Rand; losses: FileLoss[] };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The slicers a file's sheet makes on its grid, ids fresh and apart from `taken` (its charts' and pivots'): each range
 * cut to the grid (gone when it starts past it, its column with it), a column outside its range dropped, sizes within
 * D483. One placed past the grid, or past 50 a sheet, is left out and named (`slicer_unread`).
 */
export function slicersFromFile(
  slicers: readonly FileSlicer[] | undefined,
  layout: SheetLayout,
  making: SlicerMaking,
  taken: ReadonlySet<string>,
): SheetSlicer[] {
  const out: SheetSlicer[] = [];
  const ids = new Set(taken);
  for (const s of slicers ?? []) {
    const r = layout.rows[s.at.r];
    const c = layout.cols[s.at.c];
    if (out.length === SLICERS_MAX || r === undefined || c === undefined) {
      making.losses.push({ k: 'slicer_unread', sheet: making.sheet });
      continue;
    }
    const range = s.range && onGrid(s.range, layout);
    const col =
      range && s.c !== undefined && s.c >= range.c1 && s.c <= range.c2
        ? layout.cols[s.c]
        : undefined;
    const [id] = makeAxisIds(1, making.rand, ids);
    ids.add(id!);
    out.push({
      id: id!,
      kind: 'slicer',
      at: {
        r,
        c,
        dx: clamp(s.at.dx, 0, OBJECT_OFFSET_MAX),
        dy: clamp(s.at.dy, 0, OBJECT_OFFSET_MAX),
      },
      width: clamp(s.width, SLICER_SIZE_MIN.width, SLICER_SIZE_MAX),
      height: clamp(s.height, SLICER_SIZE_MIN.height, SLICER_SIZE_MAX),
      ...(range ? { range: idRangeOf(layout, range.r1, range.c1, range.r2, range.c2)! } : {}),
      ...(col !== undefined ? { col } : {}),
      ...optional({ ...s, ...(s.title ? { title: s.title.slice(0, SLICER_TITLE_MAX) } : {}) }),
    });
  }
  return out;
}

function onGrid(g: GridRange, layout: SheetLayout): GridRange | null {
  if (g.r1 >= layout.rows.length || g.c1 >= layout.cols.length) return null;
  return {
    ...g,
    r2: Math.min(g.r2, layout.rows.length - 1),
    c2: Math.min(g.c2, layout.cols.length - 1),
  };
}
