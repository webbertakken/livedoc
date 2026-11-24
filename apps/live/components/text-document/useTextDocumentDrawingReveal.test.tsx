// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "The document around it" (Search): a hit on a drawing, or an address naming
// one, opens its text document with the drawing's picture selected and in view, in the document tab holding it.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { PICTURE, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import {
  revealDrawingPicture,
  takeDrawingReveal,
} from '@/lib/text-document/text-document-drawing-reveal';

const { debugLog } = vi.hoisted(() => ({ debugLog: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog }));

const { useTextDocumentDrawingReveal } = await import('./useTextDocumentDrawingReveal');

let views: EditorView[] = [];
afterEach(() => {
  for (const view of views) view.destroy();
  views = [];
  takeDrawingReveal('w');
  debugLog.mockReset();
});

function viewWith(drawings: string[]) {
  const pictures = drawings.map((drawing) =>
    schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 60, drawing }),
  );
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('Hello'), ...pictures]),
  ]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
  });
  views.push(view);
  return view;
}

const selectedDrawing = (view: EditorView) => {
  const selection = view.state.selection;
  return selection instanceof NodeSelection ? (selection.node.attrs.drawing as string) : null;
};

function setup(
  view: EditorView,
  opts: { ready?: boolean; shownTab?: string; liveDoc?: Y.Doc } = {},
) {
  const showTab = { current: vi.fn() };
  const hook = renderHook(
    (props: { ready: boolean; shownTab: string }) =>
      useTextDocumentDrawingReveal({
        view,
        tabId: 'w',
        ready: props.ready,
        liveDoc: { current: opts.liveDoc ?? TextDocumentState.load() },
        shownTab: props.shownTab,
        showTab,
      }),
    { initialProps: { ready: opts.ready ?? true, shownTab: opts.shownTab ?? 't.0' } },
  );
  return { hook, showTab };
}

describe('useTextDocumentDrawingReveal', () => {
  it('selects the drawing picture asked for, once the writing is ready', () => {
    const view = viewWith(['d1', 'd2']);
    revealDrawingPicture('w', 'd2');
    const { hook } = setup(view, { ready: false });
    expect(selectedDrawing(view)).toBeNull();
    hook.rerender({ ready: true, shownTab: 't.0' });
    expect(selectedDrawing(view)).toBe('d2');
    expect(debugLog).toHaveBeenCalledWith('[text-document] drawing picture shown', {
      drawing: 'd2',
    });
  });

  it('selects one asked for while it is open', () => {
    const view = viewWith(['d1']);
    setup(view);
    act(() => revealDrawingPicture('w', 'd1'));
    expect(selectedDrawing(view)).toBe('d1');
  });

  it("ignores another text document tab's ask", () => {
    const view = viewWith(['d1']);
    setup(view);
    act(() => revealDrawingPicture('v', 'd1'));
    expect(selectedDrawing(view)).toBeNull();
    takeDrawingReveal('v');
  });

  it('shows the document tab holding it, then selects it there', () => {
    const view = viewWith([]);
    revealDrawingPicture('w', 'd9');
    const place = vi.spyOn(TextDocumentState, 'drawingPlace').mockReturnValue('t.2');
    const { hook, showTab } = setup(view);
    expect(showTab.current).toHaveBeenCalledWith('t.2');
    expect(debugLog).not.toHaveBeenCalledWith('[text-document] drawing picture not found', {
      drawing: 'd9',
    });
    place.mockRestore();
    // The surface binds the shown tab's writing to the same view.
    view.updateState(EditorState.create({ doc: viewWith(['d9']).state.doc }));
    hook.rerender({ ready: true, shownTab: 't.2' });
    expect(selectedDrawing(view)).toBe('d9');
  });

  it('says so when no picture names it', () => {
    const view = viewWith(['d1']);
    revealDrawingPicture('w', 'gone');
    setup(view);
    expect(selectedDrawing(view)).toBeNull();
    expect(debugLog).toHaveBeenCalledWith('[text-document] drawing picture not found', {
      drawing: 'gone',
    });
  });
});
