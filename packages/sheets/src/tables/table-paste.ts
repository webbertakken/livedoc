// Tables in a paste (docs/specs/029-sheets/data-tools.md "Tables" "Pasted tables", D454): a copy keeps each table
// whose header row it holds, as the part of it copied (its columns, header to the last copied row) with its column
// types, dropdown options, total row and banding colours. An Editor's plain paste of a copy makes a new table there,
// named the first free `TableN`; a cut of a whole table moves it, its id, name and settings kept, so its references
// still read it; a cut of part of one moves cells only. A table that would overlap a table, cross a merge or a
// banding, start in the row below a table (which grows it) or pass a sheet's 50 is not made. Pure.
import type { GridRange } from '../address';
import { makeAxisIds, type Rand } from '../ids';
import { posRangeOf } from '../layout';
import type { Banding, DropdownOption, SheetLayout } from '../sheet';
import type { LayoutChange } from '../store';
import type { Workbook } from '../engine/workbook';
import { nextTableName, TABLES_MAX, type SheetTable, type TableColumnType } from './table';
import type { TableRefusal } from './table-commands';

type Place = { i1: number; j1: number; i2: number; j2: number };

type BandLook = Omit<Banding, 'id' | 'r1' | 'c1' | 'r2' | 'c2'>;

/** A copied table: where its copied part lies in the block, and what a table made from it takes. */
export type ClipTable = {
  id: string;
  at: Place;
  // The copy holds the whole table, so a cut of it moves it.
  whole: boolean;
  total: boolean;
  // By copied column, from the part's first.
  types: (TableColumnType | null)[];
  opts: (DropdownOption[] | null)[];
  band: BandLook | null;
};

/** A table a paste lands: where (by position on the destination), and the table it moves, if a cut moves one. */
export type TableLanding = { clip: ClipTable; box: GridRange; moving: SheetTable | null };

const meets = (a: GridRange, b: GridRange) =>
  a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
const inside = (a: GridRange, b: GridRange) =>
  a.r1 >= b.r1 && a.r2 <= b.r2 && a.c1 >= b.c1 && a.c2 <= b.c2;

function bandLook(band: Banding): BandLook {
  const { id: _id, r1: _r1, c1: _c1, r2: _r2, c2: _c2, ...look } = band;
  return look;
}

/** The tables whose header row the copied `range` holds, each as its copied part. */
export function clipTablesOf(layout: SheetLayout, range: GridRange): ClipTable[] {
  const out: ClipTable[] = [];
  for (const t of layout.tables ?? []) {
    const p = posRangeOf(layout, t);
    if (!p || p.r1 < range.r1 || p.r1 > range.r2) continue;
    const c1 = Math.max(p.c1, range.c1);
    const c2 = Math.min(p.c2, range.c2);
    if (c1 > c2) continue;
    const r2 = Math.min(p.r2, range.r2);
    const cols = layout.cols.slice(c1, c2 + 1);
    const band = (layout.bands ?? []).find((b) => b.id === t.band);
    out.push({
      id: t.id,
      at: { i1: p.r1 - range.r1, j1: c1 - range.c1, i2: r2 - range.r1, j2: c2 - range.c1 },
      whole: inside(p, range),
      total: !!t.total && r2 === p.r2,
      types: cols.map((c) => t.types?.[c] ?? null),
      opts: cols.map((c) => t.opts?.[c] ?? null),
      band: band ? bandLook(band) : null,
    });
  }
  return out;
}

// Why a table cannot land over `box` on `layout` (`moving`: the table moving there, set aside), or null.
function landingRefusal(
  layout: SheetLayout,
  box: GridRange,
  moving: SheetTable | null,
  landed: readonly GridRange[],
): TableRefusal | null {
  const tables = (layout.tables ?? []).filter((t) => t.id !== moving?.id);
  if (tables.length + landed.length >= TABLES_MAX) return 'full';
  const at = (x: Parameters<typeof posRangeOf>[1]) => posRangeOf(layout, x);
  if (
    landed.some((m) => meets(m, box)) ||
    tables.some((t) => {
      const p = at(t);
      // The row below a table grows it (D454): a new table starting there would meet it.
      return !!p && meets({ ...p, r2: p.r2 + 1 }, box);
    })
  )
    return 'overlap';
  if (
    (layout.merges ?? []).some((m) => {
      const p = at(m);
      return !!p && meets(p, box);
    })
  )
    return 'merge';
  if (
    (layout.bands ?? []).some((b) => {
      const p = b.id === moving?.band ? null : at(b);
      return !!p && meets(p, box);
    })
  )
    return 'banding';
  return null;
}

/**
 * Where a pasted clip's tables land on the destination, by position, before the paste: a copy's each, a cut's whole
 * ones (moved); and what was refused. `rows` is how many rows the destination will hold once the paste has grown it.
 */
export function tableLandings(
  wb: Workbook,
  sheetId: string,
  at: { r: number; c: number },
  clip: { tables?: readonly ClipTable[]; cut?: true; from: { sheetId: string } },
  size: { rows: number; cols: number },
): { landings: TableLanding[]; refused: TableRefusal[] } {
  const out = { landings: [] as TableLanding[], refused: [] as TableRefusal[] };
  const sheet = wb.sheet(sheetId);
  const src = wb.sheet(clip.from.sheetId);
  if (!sheet || !src) return out;
  for (const t of clip.tables ?? []) {
    const moving = clip.cut
      ? t.whole
        ? ((src.layout.tables ?? []).find((x) => x.id === t.id) ?? null)
        : undefined
      : null;
    // A cut of part of a table is cells only.
    if (moving === undefined) continue;
    const box: GridRange = {
      r1: at.r + t.at.i1,
      c1: at.c + t.at.j1,
      r2: Math.min(at.r + t.at.i2, size.rows - 1),
      c2: Math.min(at.c + t.at.j2, size.cols - 1),
    };
    // A header and a data row at least, inside the grid.
    if (box.c1 > box.c2 || box.r2 <= box.r1) continue;
    const here = moving && clip.from.sheetId === sheetId ? moving : null;
    // A moving table keeps its id: another sheet holding that id cannot take it.
    const clash = moving && !here && (sheet.layout.tables ?? []).some((x) => x.id === moving.id);
    const why = clash
      ? 'overlap'
      : landingRefusal(
          sheet.layout,
          box,
          here,
          out.landings.map((l) => l.box),
        );
    if (why) out.refused.push(why);
    else out.landings.push({ clip: t, box, moving });
  }
  return out;
}

/** The ids of the tables a cut moves: formulas reading them follow their columns where they land. */
export function tablesMoved(landings: readonly TableLanding[]): Set<string> {
  return new Set(landings.flatMap((l) => (l.moving ? [l.moving.id] : [])));
}

/** The layout changes that set the landed tables down (`rows`, `cols`: the destination's axes once grown), and those
 *  that take a moved table from another sheet. */
export function tableLandingChanges(
  wb: Workbook,
  sheetId: string,
  fromId: string,
  landings: readonly TableLanding[],
  axes: { rows: readonly string[]; cols: readonly string[] },
  rand: Rand = Math.random,
): { dest: LayoutChange[]; source: LayoutChange[] } {
  const out = { dest: [] as LayoutChange[], source: [] as LayoutChange[] };
  const sheet = wb.sheet(sheetId);
  if (!sheet) return out;
  const tableIds = new Set((sheet.layout.tables ?? []).map((t) => t.id));
  const bandIds = new Set((sheet.layout.bands ?? []).map((b) => b.id));
  const named: SheetLayout[] = wb.sheetList().map((s) => s.layout);
  for (const { clip, box, moving } of landings) {
    const r1 = axes.rows[box.r1];
    const c1 = axes.cols[box.c1];
    const r2 = axes.rows[Math.min(box.r2, axes.rows.length - 1)];
    const c2 = axes.cols[Math.min(box.c2, axes.cols.length - 1)];
    if (!r1 || !c1 || !r2 || !c2) continue;
    const ids = { r1, c1, r2, c2 };
    const cols = axes.cols.slice(box.c1, box.c2 + 1);
    const types = Object.fromEntries(
      cols.flatMap((c, j) => (clip.types[j] ? [[c, clip.types[j]]] : [])),
    );
    const opts = Object.fromEntries(
      cols.flatMap((c, j) => (clip.opts[j] ? [[c, clip.opts[j]]] : [])),
    );
    const id = moving ? moving.id : makeAxisIds(1, rand, tableIds)[0]!;
    tableIds.add(id);
    const sameBand = moving?.band && sheetId === fromId ? moving.band : undefined;
    const bandId = clip.band ? (sameBand ?? makeAxisIds(1, rand, bandIds)[0]!) : undefined;
    if (bandId) bandIds.add(bandId);
    const table: SheetTable = {
      id,
      name: moving ? moving.name : nextTableName(named),
      ...ids,
      ...(Object.keys(types).length ? { types } : {}),
      ...(Object.keys(opts).length ? { opts } : {}),
      ...(clip.total ? { total: true as const } : {}),
      ...(bandId ? { band: bandId } : {}),
    };
    named.push({ rows: [], cols: [], tables: [table] });
    if (moving && sheetId !== fromId) {
      out.source.push({ k: 'table', id: moving.id, table: null });
      if (moving.band) out.source.push({ k: 'band', id: moving.band, band: null });
    }
    if (bandId && clip.band)
      out.dest.push({ k: 'band', id: bandId, band: { ...clip.band, id: bandId, ...ids } });
    out.dest.push({ k: 'table', id, table });
  }
  return out;
}
