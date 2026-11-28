'use client';

// The grid's cells for a screen reader (docs/specs/029-sheets/grid-and-editing.md "Accessibility"): the drawn cells
// and headers are a picture to it, so the cells in view are mirrored here as rows of cells with their indexes, the
// row number as each row's header, the frozen lines first. The active cell is always in it, scrolled away or not:
// it is what the grid's aria-activedescendant names. Memoised on what it reads, so a scroll within the window or a
// paint of the drawn cells costs it nothing. A pivot table's header rows and labels are headers (pivot-tables.md
// "Accessibility").
import type { DrawnPivots } from '@/lib/spreadsheet/pivot-sliced';
import { memo } from 'react';
import { cellKey, formatA1, type Sheet, type Workbook } from '@livedoc/sheets';
import { mergeAt, type Geometry } from './sheet-geometry';
import { readWorkbook } from './read-workbook';
import { cellSpokenValue, COMMENTED, NOTED } from './sheet-cell-speech';

type Props = {
  // The pivot tables this person's slicers filter, read as drawn (D629).
  drawn?: DrawnPivots | null;
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
  // The cells an open comment thread is anchored to, by `cellKey` (review.md "In the grid"); absent, none.
  commented?: ReadonlyMap<string, unknown> | undefined;
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
  const activeNote = readWorkbook(p.version, () =>
    p.workbook.cellNoteOf(p.sheet.id, p.activeR, p.activeC),
  );
  // Read under the store's version (read-workbook.ts): the workbook is one mutable copy.
  return readWorkbook(p.version, () => (
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
            // A noted cell says so (review.md "Accessibility"); the active one's note is its description, as the hover
            // card shows it to the pointer.
            const note = p.workbook.cellNoteOf(p.sheet.id, r, c);
            const rowId = p.sheet.layout.rows[r];
            const colId = p.sheet.layout.cols[c];
            const commented =
              rowId !== undefined &&
              colId !== undefined &&
              !!p.commented?.has(cellKey(rowId, colId));
            const cellId = mirrorCellId(p.elementId, r, c);
            const said = `${formatA1(r, c)} ${cellSpokenValue(p.sheet, p.workbook, p.locale, r, c, p.drawn)}`;
            return (
              <span
                key={c}
                id={active ? cellId : undefined}
                role={header ? `${header}header` : 'gridcell'}
                aria-colindex={c + 1}
                aria-selected={active || undefined}
                aria-describedby={active && note !== null ? `${cellId}-note` : undefined}
              >
                {note === null && !commented
                  ? said
                  : `${said.trimEnd()}${note === null ? '' : NOTED}${commented ? COMMENTED : ''}`}
              </span>
            );
          })}
        </div>
      ))}
      {activeNote === null ? null : (
        <span id={`${mirrorCellId(p.elementId, p.activeR, p.activeC)}-note`}>{activeNote}</span>
      )}
    </div>
  ));
}

export const SheetGridMirror = memo(SheetGridMirrorInner);
