'use client';

// The grid's cells for a screen reader (docs/specs/029-sheets/grid-and-editing.md "Accessibility"): the drawn cells
// and headers are a picture to it, so the cells in view are mirrored here as rows of cells with their indexes, the
// row number as each row's header, the frozen lines first. The active cell is always in it, scrolled away or not:
// it is what the grid's aria-activedescendant names. Memoised on what it reads, so a scroll within the window or a
// paint of the drawn cells costs it nothing. A pivot table's header rows and labels are headers (pivot-tables.md
// "Accessibility").
import { memo } from 'react';
import { formatA1, type Sheet, type Workbook } from '@livedoc/sheets';
import { mergeAt, type Geometry } from './sheet-geometry';
import { cellSpokenValue } from './sheet-cell-speech';

type Props = {
  elementId: string;
  sheet: Sheet;
  workbook: Workbook;
  // The workbook's version: a value changed redraws the mirror.
  version: number;
  geometry: Geometry;
  locale: string;
  // The scrolling rows in view, in the order drawn.
  rows: readonly number[];
  c1: number;
  c2: number;
  activeR: number;
  activeC: number;
};

/** The id of a cell in the mirror, as the grid's aria-activedescendant names it. */
export const mirrorCellId = (elementId: string, r: number, c: number) =>
  `${elementId}-${formatA1(r, c)}`;

// The lines mirrored on one axis: the frozen ones, the window's, and the active one, each once, in the order drawn,
// none hidden.
function linesOf(
  frozen: number,
  inView: Iterable<number>,
  active: number,
  hidden: (i: number) => boolean,
  drawnOf: (i: number) => number = (i) => i,
) {
  const lines = new Set<number>();
  for (let i = 0; i < frozen; i++) lines.add(i);
  for (const i of inView) lines.add(i);
  const out = [...lines].filter((i) => !hidden(i));
  if (!out.includes(active)) out.push(active);
  return out.sort((a, b) => drawnOf(a) - drawnOf(b));
}

function span(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

function SheetGridMirrorInner(p: Props) {
  const g = p.geometry;
  const rows = linesOf(g.frozenRows, p.rows, p.activeR, g.hiddenRow, g.drawnOf);
  const cols = linesOf(g.frozenCols, span(p.c1, p.c2), p.activeC, g.hiddenCol);
  return (
    <div className="sr-only">
      {rows.map((r) => (
        <div key={r} role="row" aria-rowindex={r + 1}>
          <span role="rowheader">{r + 1}</span>
          {cols.map((c) => {
            const active = r === p.activeR && c === p.activeC;
            const merge = mergeAt(g, r, c);
            const header = p.workbook.pivotHeaderAt(p.sheet.id, r, c);
            // A merge once, at its top-left; the active cell always, so focus names a cell that is there.
            if (!active && merge && (merge.r1 !== r || merge.c1 !== c)) return null;
            return (
              <span
                key={c}
                id={active ? mirrorCellId(p.elementId, r, c) : undefined}
                role={header ? `${header}header` : 'gridcell'}
                aria-colindex={c + 1}
                aria-selected={active || undefined}
              >
                {`${formatA1(r, c)} ${cellSpokenValue(p.sheet, p.workbook, p.locale, r, c)}`}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const SheetGridMirror = memo(SheetGridMirrorInner);
