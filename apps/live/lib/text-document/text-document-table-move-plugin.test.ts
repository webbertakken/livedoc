// @vitest-environment jsdom
// docs/specs/034-text-documents/tables.md "Working in a table", Move: hovering a cell shows a grip beside its row and
// above its column; dragging a grip draws a drop line, and releasing moves the row or column there; Escape cancels; a
// reader sees no grip. jsdom draws nothing: cells are drawn here 100 px wide and 30 px high, from (50, 50).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { tableMovePlugin } = await import('./text-document-table-move-plugin');

const W = 100;
const H = 30;
const X = 50;
const Y = 50;

const cell = (text: string) =>
  schema.nodes.table_cell!.create(
    { colwidth: [75] },
    schema.nodes.paragraph!.create(null, schema.text(text)),
  );
const doc = () =>
  schema.nodes.doc!.create(null, [
    schema.nodes.table!.create(
      null,
      [1, 2, 3].map((r) =>
        schema.nodes.table_row!.create(null, [cell(`a${r}`), cell(`b${r}`), cell(`c${r}`)]),
      ),
    ),
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
    state: EditorState.create({ doc: doc(), plugins: [tableMovePlugin()] }),
    editable: () => editable,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.tagName === 'TABLE') return rect(X, Y, 3 * W, 3 * H);
    if (this.tagName === 'TR') {
      const r = [...this.parentElement!.children].indexOf(this);
      return rect(X, Y + r * H, 3 * W, H);
    }
    if (this.tagName === 'TD') {
      const tr = this.parentElement!;
      const r = [...tr.parentElement!.children].indexOf(tr);
      return rect(X + [...tr.children].indexOf(this) * W, Y + r * H, W, H);
    }
    return rect(0, 0, 0, 0);
  });
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
const grip = (kind: 'row' | 'column') =>
  document.querySelector<HTMLElement>(`.text-document-table-grip[data-kind="${kind}"]`);
const firstColumn = (): string[] => {
  const table: PmNode = view.state.doc.firstChild!;
  return table.content.content.map((r) => r.firstChild!.textContent);
};

describe('tableMovePlugin', () => {
  it('shows a grip beside the hovered cell\u2019s row and above its column, hidden from reading', () => {
    pointer('mousemove', td(1, 1), X + 150, Y + 40);
    expect(grip('row')?.getAttribute('aria-hidden')).toBe('true');
    expect(grip('row')!.style.top).toBe(`${Y + H + H / 2}px`);
    expect(grip('column')!.style.left).toBe(`${X + W + W / 2}px`);
  });

  it('moves a row where its grip is dropped, drawing a drop line meanwhile', () => {
    pointer('mousemove', td(0, 0), X + 10, Y + 10);
    pointer('mousedown', grip('row')!, X - 10, Y + 15);
    pointer('mousemove', window, X - 10, Y + 85);
    const line = document.querySelector<HTMLElement>('.text-document-table-drop');
    expect(line?.getAttribute('aria-hidden')).toBe('true');
    expect(line!.style.top).toBe(`${Y + 3 * H}px`);
    pointer('mouseup', window, X - 10, Y + 85);
    expect(firstColumn()).toEqual(['a2', 'a3', 'a1']);
    expect(document.querySelector('.text-document-table-drop')).toBeNull();
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentTableMoveRow');
  });

  it('moves a column where its grip is dropped', () => {
    pointer('mousemove', td(0, 2), X + 250, Y + 10);
    pointer('mousedown', grip('column')!, X + 250, Y - 10);
    pointer('mouseup', window, X + 20, Y - 10);
    const table: PmNode = view.state.doc.firstChild!;
    expect(table.child(0).content.content.map((c) => c.textContent)).toEqual(['c1', 'a1', 'b1']);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentTableMoveColumn');
  });

  it('changes nothing when Escape cancels the drag', () => {
    pointer('mousemove', td(0, 0), X + 10, Y + 10);
    pointer('mousedown', grip('row')!, X - 10, Y + 15);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    pointer('mouseup', window, X - 10, Y + 85);
    expect(firstColumn()).toEqual(['a1', 'a2', 'a3']);
  });

  it('shows a reader no grip', () => {
    editable = false;
    view.setProps({});
    pointer('mousemove', td(0, 0), X + 10, Y + 10);
    expect(grip('row')).toBeNull();
  });
});
