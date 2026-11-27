// A sheet's objects after rows or columns are deleted (docs/specs/029-sheets/charts.md "The model"; pivot tables:
// pivot-tables.md "The model", sheet-pivot.ts): a chart's range
// shrinks to what is left of it (none left: no data), its picked columns and series looks lose the gone columns, and
// an anchor on a gone row or column moves to the one that takes its place (the next, else the one before), a chart's
// and an image's alike.
import type { SheetLayout } from '../sheet';
import { shrinkRange } from '../store-layout';
import type { CellAnchor, SheetChart, SheetObject } from './sheet-objects';
import { pivotAfterDelete } from './sheet-pivot';

// The surviving id at a gone one's place in the old order: the next one left, else the one before; null when none is.
function survivor(list: readonly string[], id: string, gone: ReadonlySet<string>): string | null {
  const at = list.indexOf(id);
  if (at < 0) return null;
  for (let i = at + 1; i < list.length; i++) if (!gone.has(list[i]!)) return list[i]!;
  for (let i = at - 1; i >= 0; i--) if (!gone.has(list[i]!)) return list[i]!;
  return null;
}

function anchorAfter(
  at: CellAnchor,
  before: SheetLayout,
  goneRows: ReadonlySet<string>,
  goneCols: ReadonlySet<string>,
): CellAnchor {
  const r = goneRows.has(at.r) ? survivor(before.rows, at.r, goneRows) : at.r;
  const c = goneCols.has(at.c) ? survivor(before.cols, at.c, goneCols) : at.c;
  // A sheet always keeps a row and a column, so a survivor is always found; the old id stays when it is not.
  return r === at.r && c === at.c ? at : { ...at, r: r ?? at.r, c: c ?? at.c };
}

function chartAfter(
  x: SheetChart,
  before: SheetLayout,
  goneRows: ReadonlySet<string>,
  goneCols: ReadonlySet<string>,
): SheetChart {
  const { range: _range, cols: _cols, series: _series, ...rest } = x;
  const cols = x.cols?.filter((id) => !goneCols.has(id));
  // Every picked column gone leaves no data, as every cell gone does.
  const range =
    x.range && (!cols || cols.length) ? shrinkRange(x.range, before, goneRows, goneCols) : null;
  const series = x.series
    ? Object.fromEntries(Object.entries(x.series).filter(([id]) => !goneCols.has(id)))
    : undefined;
  return {
    ...rest,
    at: anchorAfter(x.at, before, goneRows, goneCols),
    ...(range ? { range } : {}),
    ...(range && cols?.length ? { cols } : {}),
    ...(series && Object.keys(series).length ? { series } : {}),
  };
}

export function objectsAfterDelete(
  before: SheetLayout,
  goneRows: ReadonlySet<string>,
  goneCols: ReadonlySet<string>,
): SheetObject[] | undefined {
  const objects = before.objects!.flatMap((x): SheetObject[] => {
    if (x.kind === 'chart') return [chartAfter(x, before, goneRows, goneCols)];
    if (x.kind === 'image') return [{ ...x, at: anchorAfter(x.at, before, goneRows, goneCols) }];
    const pivot = pivotAfterDelete(x, before, goneRows, goneCols);
    return pivot ? [pivot] : [];
  });
  return objects.length ? objects : undefined;
}
