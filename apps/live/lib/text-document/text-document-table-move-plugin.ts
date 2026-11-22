// Moving a table's rows and columns by dragging their grip (docs/specs/034-text-documents/tables.md "Working in a
// table", Move). Hovering a cell shows a six-dot grip left of the table beside its row and one above the table over
// its column; pressing a grip and dragging draws a line where it would drop, and releasing moves the row or column
// there in one transaction. Escape cancels. The grips are the pointer's only (Format > Table moves without one), and an
// Editor's only.
import { Plugin } from 'prosemirror-state';
import { TableMap, cellAround } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { columnWidths } from './text-document-table-dom';
import { moveColumnTo, moveRowTo } from './text-document-table-move';
import { startUndoStep } from './text-document-undo';

const GRIP_CLASS = 'text-document-table-grip';
const DROP_CLASS = 'text-document-table-drop';
// How far a row's grip stands left of the table, and a column's above it, in client pixels (default).
const GRIP_OFFSET_PX = 10;
// How long the grips stay once the pointer leaves the table, so it can reach them, in milliseconds (default).
const GRIP_LINGER_MS = 400;
const PX_PER_PT = 96 / 72;

type Kind = 'row' | 'column';

// The hovered cell's table and its row and column.
type Hovered = {
  readonly table: HTMLTableElement;
  readonly tableStart: number;
  readonly row: number;
  readonly column: number;
};

const ownRows = (table: HTMLTableElement): HTMLElement[] =>
  [...table.querySelectorAll<HTMLElement>(':scope > tbody > tr')].filter(
    (r) => !r.classList.contains('text-document-page-gap'),
  );

// Where the drawn columns' borders stand, from the table's left, in client pixels: one more than the columns.
function columnEdges(view: EditorView, hovered: Hovered): number[] {
  const table = view.state.doc.resolve(hovered.tableStart).parent;
  const box = hovered.table.getBoundingClientRect();
  const width = Number.parseFloat(getComputedStyle(view.dom).width);
  const ratio = width > 0 ? view.dom.getBoundingClientRect().width / width || 1 : 1;
  const edges = [box.left];
  for (const w of columnWidths(table)) edges.push(edges.at(-1)! + w * PX_PER_PT * ratio);
  return edges;
}

// The overlay's home: inside the office shell (its colours), drawn fixed over the page.
const overlayRoot = (view: EditorView): HTMLElement =>
  view.dom.closest<HTMLElement>('.office-shell') ?? view.dom.ownerDocument.body;

function hoveredAt(view: EditorView, target: EventTarget | null): Hovered | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest<HTMLElement>('td, th');
  const table = cell?.closest<HTMLTableElement>('table');
  if (!cell || !table || !view.dom.contains(cell) || cell.closest('.text-document-page-gap'))
    return null;
  let $cell;
  try {
    $cell = cellAround(view.state.doc.resolve(view.posAtDOM(cell, 0)));
  } catch {
    return null;
  }
  if (!$cell) return null;
  const tableStart = $cell.start(-1);
  const rect = TableMap.get($cell.node(-1)).findCell($cell.pos - tableStart);
  return { table, tableStart, row: rect.top, column: rect.left };
}

function gripIcon(kind: Kind): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const [w, h] = kind === 'row' ? [10, 16] : [16, 10];
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 3; b++) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const [x, y] = kind === 'row' ? [3 + a * 4, 3 + b * 5] : [3 + b * 5, 3 + a * 4];
      dot.setAttribute('cx', String(x));
      dot.setAttribute('cy', String(y));
      dot.setAttribute('r', '1.4');
      dot.setAttribute('fill', 'currentColor');
      svg.append(dot);
    }
  return svg;
}

/** Move a table's rows and columns by dragging their grips. */
export function tableMovePlugin(): Plugin {
  const grips = new Map<Kind, HTMLElement>();
  let hovered: Hovered | null = null;
  let linger: ReturnType<typeof setTimeout> | undefined;
  let dragging = false;

  const hide = () => {
    clearTimeout(linger);
    for (const grip of grips.values()) grip.remove();
    grips.clear();
    hovered = null;
  };
  const hideSoon = () => {
    clearTimeout(linger);
    linger = setTimeout(() => {
      if (!dragging) hide();
    }, GRIP_LINGER_MS);
  };

  const place = (view: EditorView, at: Hovered) => {
    const box = at.table.getBoundingClientRect();
    const row = ownRows(at.table)[at.row]?.getBoundingClientRect();
    const edges = columnEdges(view, at);
    if (!row) return hide();
    const spots: Record<Kind, { left: number; top: number }> = {
      row: { left: box.left - GRIP_OFFSET_PX, top: row.top + row.height / 2 },
      column: {
        left: (edges[at.column]! + edges[at.column + 1]!) / 2,
        top: box.top - GRIP_OFFSET_PX,
      },
    };
    for (const kind of ['row', 'column'] as const) {
      let grip = grips.get(kind);
      if (!grip) {
        grip = document.createElement('div');
        grip.className = GRIP_CLASS;
        grip.dataset.kind = kind;
        grip.setAttribute('aria-hidden', 'true');
        grip.append(gripIcon(kind));
        grip.addEventListener('mouseenter', () => clearTimeout(linger));
        grip.addEventListener('mouseleave', hideSoon);
        grip.addEventListener('mousedown', (event) => {
          if (event.button !== 0 || !hovered) return;
          event.preventDefault();
          startDrag(view, hovered, kind);
        });
        overlayRoot(view).append(grip);
        grips.set(kind, grip);
      }
      grip.style.left = `${spots[kind].left}px`;
      grip.style.top = `${spots[kind].top}px`;
    }
  };

  const startDrag = (view: EditorView, from: Hovered, kind: Kind) => {
    dragging = true;
    const line = document.createElement('div');
    line.className = DROP_CLASS;
    line.dataset.kind = kind;
    line.setAttribute('aria-hidden', 'true');
    overlayRoot(view).append(line);
    const box = from.table.getBoundingClientRect();
    const rowEdges = (() => {
      const rows = ownRows(from.table).map((r) => r.getBoundingClientRect());
      return [...rows.map((r) => r.top), rows.at(-1)?.bottom ?? box.bottom];
    })();
    const edges = kind === 'row' ? rowEdges : columnEdges(view, from);
    // The edge nearest the pointer: the place the row or column would stand before.
    const target = (x: number, y: number) => {
      const at = kind === 'row' ? y : x;
      let to = 0;
      for (let k = 0; k < edges.length - 1; k++)
        if (at > (edges[k]! + edges[k + 1]!) / 2) to = k + 1;
      return to;
    };
    const draw = (to: number) => {
      if (kind === 'row') {
        line.style.left = `${box.left}px`;
        line.style.width = `${box.width}px`;
        line.style.top = `${edges[to]}px`;
      } else {
        line.style.top = `${box.top}px`;
        line.style.height = `${box.height}px`;
        line.style.left = `${edges[to]}px`;
      }
    };
    draw(kind === 'row' ? from.row : from.column);
    const end = () => {
      dragging = false;
      line.remove();
      hide();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey, true);
    };
    const onMove = (event: MouseEvent) => draw(target(event.clientX, event.clientY));
    const onUp = (event: MouseEvent) => {
      end();
      const to = target(event.clientX, event.clientY);
      const command =
        kind === 'row'
          ? moveRowTo(from.tableStart, from.row, to)
          : moveColumnTo(from.tableStart, from.column, to);
      startUndoStep(view);
      if (command(view.state, view.dispatch)) {
        startUndoStep(view);
        track(
          'Element',
          'Changed',
          kind === 'row' ? 'TextDocumentTableMoveRow' : 'TextDocumentTableMoveColumn',
        );
        debugLog('[text-document] table', { change: 'moved', what: kind, to });
      } else debugLog('[text-document] table', { change: 'move-refused', what: kind, to });
      view.focus();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      end();
      debugLog('[text-document] table', { change: 'move-cancelled', what: kind });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey, true);
  };

  return new Plugin({
    view: () => ({ destroy: hide }),
    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          if (dragging) return false;
          const at = view.editable ? hoveredAt(view, event.target) : null;
          if (!at) {
            if (grips.size > 0) hideSoon();
            return false;
          }
          clearTimeout(linger);
          hovered = at;
          place(view, at);
          return false;
        },
        mouseleave() {
          if (grips.size > 0) hideSoon();
          return false;
        },
      },
    },
  });
}
