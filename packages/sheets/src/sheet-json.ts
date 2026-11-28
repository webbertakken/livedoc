// A sheet as JSON (the wire, the offline record, the Drive file): cells as a list, since a Map is not JSON.
import { CellMap } from './cells/cell-map';
import {
  splitCellKey,
  type Cell,
  type CellFormat,
  type CellInput,
  type Sheet,
  type SheetLayout,
  type SheetPerson,
} from './sheet';

export type SheetCellJson = { r: string; c: string; i?: CellInput; f?: CellFormat; n?: string };

export type SheetJson = {
  id: string;
  tabId: string;
  title: string;
  layout: SheetLayout;
  cells: SheetCellJson[];
  rev: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: SheetPerson;
};

export function cellToJson(key: string, cell: Cell | undefined): SheetCellJson {
  const { r, c } = splitCellKey(key);
  return {
    r,
    c,
    ...(cell?.input ? { i: cell.input } : {}),
    ...(cell?.format ? { f: cell.format } : {}),
    ...(cell?.note !== undefined ? { n: cell.note } : {}),
  };
}

export function sheetToJson(sheet: Sheet): SheetJson {
  return {
    id: sheet.id,
    tabId: sheet.tabId,
    title: sheet.title,
    layout: sheet.layout,
    cells: [...sheet.cells].map(([key, cell]) => cellToJson(key, cell)),
    rev: sheet.rev,
    createdAt: sheet.createdAt,
    updatedAt: sheet.updatedAt,
    updatedBy: sheet.updatedBy,
  };
}

export function cellsFromJson(cells: readonly SheetCellJson[]): CellMap {
  const out = CellMap.sized(cells.length);
  for (const x of cells) {
    if (!x.i && !x.f && x.n === undefined) continue;
    out.setCell(x.r, x.c, x.i || undefined, x.f || undefined, x.n);
  }
  return out;
}

/** A page of cells (a spreadsheet loading by rows) set over a copy of the cells held; the held ones are untouched. */
export function cellsWithPage(cells: CellMap, page: readonly SheetCellJson[]): CellMap {
  const out = cells.copy();
  for (const x of page) {
    if (!x.i && !x.f && x.n === undefined) continue;
    out.setCell(x.r, x.c, x.i || undefined, x.f || undefined, x.n);
  }
  return out;
}

export function sheetFromJson(json: SheetJson): Sheet {
  return { ...json, cells: cellsFromJson(json.cells) };
}
