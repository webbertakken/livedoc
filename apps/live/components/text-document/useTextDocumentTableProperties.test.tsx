// @vitest-environment jsdom
// docs/specs/034-text-documents/tables.md "Table properties": the caret's table read again as the caret moves, a change
// made and counted, the item dimmed outside a table, and nothing for a session that does not write.
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import {
  TABLE_PROPERTIES_ITEM,
  useTextDocumentTableProperties,
} from './useTextDocumentTableProperties';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

function editor() {
  const doc = schema.nodes.doc!.create(null, [
    schema.nodes.paragraph!.create(null, schema.text('before')),
    schema.nodes.table!.create(null, [
      schema.nodes.table_row!.create(null, [
        schema.nodes.table_cell!.create(
          { colwidth: [100] },
          schema.nodes.paragraph!.create(null, schema.text('a1')),
        ),
      ]),
    ]),
  ]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, schema }),
  });
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const caretAt = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      for (const listener of listeners) listener();
    });
  return { view, subscribe, caretAt };
}

describe('useTextDocumentTableProperties', () => {
  it('reads the caret\u2019s table, dims its item outside one, and makes a change', () => {
    const { view, subscribe, caretAt } = editor();
    const toggle = { run: vi.fn() };
    const { result } = renderHook(() =>
      useTextDocumentTableProperties({ view, writes: true, subscribe, toggle }),
    );
    expect(result.current.properties).toBeNull();
    expect(result.current.actions[TABLE_PROPERTIES_ITEM]!.disabled).toBe(true);
    // In the cell: past "before" (8), the table, row, cell and paragraph openings.
    caretAt(13);
    expect(result.current.properties?.columnWidth).toBe(100);
    expect(result.current.actions[TABLE_PROPERTIES_ITEM]!.disabled).toBe(false);
    act(() => result.current.apply({ field: 'columnWidth', value: 150 }));
    caretAt(13);
    expect(result.current.properties?.columnWidth).toBe(150);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentTableProperties');
    view.destroy();
  });

  it('binds nothing and changes nothing for a session that does not write', () => {
    const { view, subscribe, caretAt } = editor();
    const { result } = renderHook(() =>
      useTextDocumentTableProperties({ view, writes: false, subscribe, toggle: { run: vi.fn() } }),
    );
    caretAt(13);
    expect(result.current.actions).toEqual({});
    const before = view.state.doc;
    act(() => result.current.apply({ field: 'columnWidth', value: 150 }));
    expect(view.state.doc).toBe(before);
    view.destroy();
  });
});
