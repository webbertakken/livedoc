// Resizing a table's columns and rows by dragging their borders (docs/specs/034-text-documents/tables.md "Working in a
// table", Resize). Over a cell's right or bottom border the editor shows a resize cursor; a press there drags a guide
// line, and the release sets the columns' widths or the row's minimum height in one transaction. Escape cancels. An
// Editor's only: a view that cannot be edited offers none.
import { Plugin } from 'prosemirror-state';
import { TableMap, cellAround } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { setColumnWidths } from './text-document-table-edits';
import { columnWidths } from './text-document-table-dom';
import {
  TABLE_BORDER_SLOP_PX,
  borderAt,
  resizedColumns,
  resizedRow,
} from './text-document-table-resize';
import { startUndoStep } from './text-document-undo';

const GUIDE_CLASS = 'text-document-table-resize-guide';
// Points per CSS pixel.
const PT_PER_PX = 72 / 96;

/** What a border under the pointer resizes: a column (by its right border) or a row (by its bottom one). */
type Border = {
  readonly kind: 'column' | 'row';
  // The table's start (inside it), the column or row the border closes, and the elements it is drawn by.
  readonly tableStart: number;
  readonly index: number;
  readonly table: HTMLElement;
  readonly row: HTMLElement;
};

// The cell element under `target`, in one of the writing's own tables (never a copy drawn at a page's top).
function cellOf(view: EditorView, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest<HTMLElement>('td, th');
  if (!cell || !view.dom.contains(cell) || cell.closest('.text-document-page-gap')) return null;
  return cell;
}

// The border under the point, of the cell at `cell`: its right or bottom one, or (the pointer just past its left or top
// edge) the right border of the column before it or the bottom one of the row above, as the document holds them.
function borderUnder(view: EditorView, cell: HTMLElement, x: number, y: number): Border | null {
  const box = cell.getBoundingClientRect();
  const near = (a: number, b: number) => Math.abs(a - b) <= TABLE_BORDER_SLOP_PX;
  const side =
    borderAt(box, x, y) ??
    (near(x, box.left)
      ? 'left'
      : near(y, box.top) && x >= box.left && x <= box.right
        ? 'top'
        : null);
  if (!side) return null;
  let $cell;
  try {
    $cell = cellAround(view.state.doc.resolve(view.posAtDOM(cell, 0)));
  } catch {
    return null;
  }
  const table = cell.closest<HTMLElement>('table');
  if (!$cell || !table) return null;
  const tableStart = $cell.start(-1);
  const rect = TableMap.get($cell.node(-1)).findCell($cell.pos - tableStart);
  const index = {
    right: rect.right - 1,
    left: rect.left - 1,
    bottom: rect.bottom - 1,
    top: rect.top - 1,
  }[side];
  if (index < 0) return null;
  const kind = side === 'right' || side === 'left' ? 'column' : 'row';
  const rows = [...table.querySelectorAll<HTMLElement>(':scope > tbody > tr')].filter(
    (r) => !r.classList.contains('text-document-page-gap'),
  );
  const row = rows[kind === 'row' ? index : rect.top];
  return row ? { kind, tableStart, index, table, row } : null;
}

// Client pixels per CSS pixel: the page's zoom.
function ratioOf(view: EditorView): number {
  const width = Number.parseFloat(getComputedStyle(view.dom).width);
  const box = view.dom.getBoundingClientRect();
  return width > 0 && box.width > 0 ? box.width / width : 1;
}

function guideFor(view: EditorView, border: Border, x: number, y: number): HTMLElement {
  const guide = document.createElement('div');
  // Drawn outside the shell, in the shell's own accent.
  guide.style.background = getComputedStyle(view.dom).getPropertyValue('--office-primary');
  guide.className = GUIDE_CLASS;
  guide.dataset.kind = border.kind;
  guide.setAttribute('aria-hidden', 'true');
  const box = border.table.getBoundingClientRect();
  if (border.kind === 'column') {
    guide.style.top = `${box.top}px`;
    guide.style.height = `${box.height}px`;
  } else {
    guide.style.left = `${box.left}px`;
    guide.style.width = `${box.width}px`;
  }
  moveGuide(guide, border, x, y);
  document.body.append(guide);
  return guide;
}

function moveGuide(guide: HTMLElement, border: Border, x: number, y: number): void {
  if (border.kind === 'column') guide.style.left = `${x}px`;
  else guide.style.top = `${y}px`;
}

// The border moved by `delta` client pixels: the columns' widths or the row's height set, one undo step.
function release(view: EditorView, border: Border, delta: number, startHeight: number): void {
  const table = view.state.doc.resolve(border.tableStart).parent;
  if (delta === 0 || table.type.name !== 'table') return;
  const points = (delta / ratioOf(view)) * PT_PER_PX;
  const tr = view.state.tr;
  if (border.kind === 'column') {
    setColumnWidths(
      tr,
      border.tableStart,
      resizedColumns(columnWidths(table), border.index, points),
    );
  } else {
    if (border.index >= table.childCount) return;
    let pos = border.tableStart;
    for (let r = 0; r < border.index; r++) pos += table.child(r).nodeSize;
    const row = table.child(border.index);
    tr.setNodeMarkup(pos, null, {
      ...row.attrs,
      height: resizedRow(startHeight, points),
      heightRule: null,
    });
  }
  startUndoStep(view);
  view.dispatch(tr);
  startUndoStep(view);
  track(
    'Element',
    'Changed',
    border.kind === 'column' ? 'TextDocumentTableResizeColumn' : 'TextDocumentTableResizeRow',
  );
  debugLog('[text-document] table', { change: 'resized', what: border.kind });
}

function startDrag(view: EditorView, border: Border, x: number, y: number): void {
  const guide = guideFor(view, border, x, y);
  // The row's height as drawn, in points, before the drag.
  const startHeight = (border.row.getBoundingClientRect().height / ratioOf(view)) * PT_PER_PX;
  const end = () => {
    guide.remove();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey, true);
  };
  const onMove = (event: MouseEvent) => moveGuide(guide, border, event.clientX, event.clientY);
  const onUp = (event: MouseEvent) => {
    end();
    release(
      view,
      border,
      border.kind === 'column' ? event.clientX - x : event.clientY - y,
      startHeight,
    );
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    end();
    debugLog('[text-document] table', { change: 'resize-cancelled', what: border.kind });
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey, true);
}

/** Resize a table's columns and rows by dragging their borders. */
export function tableResizePlugin(): Plugin {
  let hovered: Border | null = null;
  const show = (view: EditorView, border: Border | null) => {
    hovered = border;
    if (border) view.dom.dataset.tableResize = border.kind;
    else delete view.dom.dataset.tableResize;
  };
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          if (!view.editable || event.buttons !== 0) {
            if (hovered) show(view, null);
            return false;
          }
          const cell = cellOf(view, event.target);
          show(view, cell ? borderUnder(view, cell, event.clientX, event.clientY) : null);
          return false;
        },
        mouseleave(view) {
          if (hovered) show(view, null);
          return false;
        },
        mousedown(view, event) {
          if (!hovered || !view.editable || event.button !== 0) return false;
          event.preventDefault();
          const border = hovered;
          show(view, null);
          startDrag(view, border, event.clientX, event.clientY);
          return true;
        },
      },
    },
  });
}
