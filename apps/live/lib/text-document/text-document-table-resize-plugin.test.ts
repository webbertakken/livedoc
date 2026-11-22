// @vitest-environment jsdom
// docs/specs/034-text-documents/tables.md "Working in a table", Resize: over a border the pointer becomes a resize
// cursor; dragging draws a guide and releasing sets the border, one transaction; Escape cancels; no cursor for a reader.
// jsdom draws nothing: each cell is drawn here 100 px wide (75 pt) and 30 px high, rows one under another.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import { columnWidths } from './text-document-table-dom';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { tableResizePlugin } = await import('./text-document-table-resize-plugin');

const W = 100;
const H = 30;

const cell = (text: string) =>
  schema.nodes.table_cell!.create(
    { colwidth: [75] },
    schema.nodes.paragraph!.create(null, schema.text(text)),
  );
const doc = () =>
  schema.nodes.doc!.create(null, [
    schema.nodes.table!.create(null, [
      schema.nodes.table_row!.create(null, [cell('a1'), cell('b1'), cell('c1')]),
      schema.nodes.table_row!.create(null, [cell('a2'), cell('b2'), cell('c2')]),
    ]),
  ]);

let view: EditorView;
let editable = true;

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
  }) as DOMRect;

beforeEach(() => {
  editable = true;
  const place = document.createElement('div');
  document.body.append(place);
  view = new EditorView(place, {
    state: EditorState.create({ doc: doc(), plugins: [tableResizePlugin()] }),
    editable: () => editable,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === view.dom) return rect(0, 0, 3 * W, 2 * H);
    if (this.tagName === 'TABLE') return rect(0, 0, 3 * W, 2 * H);
    if (this.tagName === 'TR') {
      const r = [...this.parentElement!.children].indexOf(this);
      return rect(0, r * H, 3 * W, H);
    }
    if (this.tagName === 'TD') {
      const tr = this.parentElement!;
      const r = [...tr.parentElement!.children].indexOf(tr);
      return rect([...tr.children].indexOf(this) * W, r * H, W, H);
    }
    return rect(0, 0, 0, 0);
  });
  view.dom.style.width = `${3 * W}px`;
});

afterEach(() => {
  view.destroy();
  vi.restoreAllMocks();
  track.mockClear();
  document.body.replaceChildren();
});

const td = (r: number, c: number) =>
  view.dom.querySelectorAll('tr')[r]!.querySelectorAll('td')[c] as HTMLElement;
const pointer = (type: string, target: EventTarget, x: number, y: number) =>
  target.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }),
  );
const table = (): PmNode => view.state.doc.firstChild!;

describe('tableResizePlugin', () => {
  it('shows a column or row resize cursor over a border, and none inside a cell', () => {
    pointer('mousemove', td(0, 0), 98, 10);
    expect(view.dom.dataset.tableResize).toBe('column');
    pointer('mousemove', td(0, 0), 50, 28);
    expect(view.dom.dataset.tableResize).toBe('row');
    pointer('mousemove', td(0, 0), 50, 10);
    expect(view.dom.dataset.tableResize).toBeUndefined();
  });

  it('takes the border just left of a cell as the cell before it', () => {
    pointer('mousemove', td(0, 1), 102, 10);
    expect(view.dom.dataset.tableResize).toBe('column');
  });

  it('moves width between two columns on release, drawing a guide meanwhile', () => {
    pointer('mousemove', td(0, 0), 99, 10);
    pointer('mousedown', td(0, 0), 99, 10);
    pointer('mousemove', window, 139, 10);
    const guide = document.querySelector<HTMLElement>('.text-document-table-resize-guide');
    expect(guide?.getAttribute('aria-hidden')).toBe('true');
    expect(guide?.style.left).toBe('139px');
    expect(columnWidths(table())).toEqual([75, 75, 75]);
    pointer('mouseup', window, 139, 10);
    // 40 px is 30 pt.
    expect(columnWidths(table())).toEqual([105, 45, 75]);
    expect(document.querySelector('.text-document-table-resize-guide')).toBeNull();
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentTableResizeColumn');
  });

  it('widens the last column and the table at its right border', () => {
    pointer('mousemove', td(1, 2), 299, 40);
    pointer('mousedown', td(1, 2), 299, 40);
    pointer('mouseup', window, 319, 40);
    expect(columnWidths(table())).toEqual([75, 75, 90]);
  });

  it("sets a row's minimum height from its bottom border", () => {
    pointer('mousemove', td(0, 1), 150, 29);
    pointer('mousedown', td(0, 1), 150, 29);
    pointer('mouseup', window, 150, 49);
    // Drawn 30 px (22.5 pt), dragged 20 px (15 pt).
    expect(table().child(0).attrs).toMatchObject({ height: 37.5, heightRule: null });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentTableResizeRow');
  });

  it('changes nothing when Escape cancels the drag', () => {
    pointer('mousemove', td(0, 0), 99, 10);
    pointer('mousedown', td(0, 0), 99, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    pointer('mouseup', window, 160, 10);
    expect(columnWidths(table())).toEqual([75, 75, 75]);
    expect(document.querySelector('.text-document-table-resize-guide')).toBeNull();
  });

  it('offers no resizing to a reader', () => {
    editable = false;
    view.setProps({});
    pointer('mousemove', td(0, 0), 99, 10);
    expect(view.dom.dataset.tableResize).toBeUndefined();
  });
});
