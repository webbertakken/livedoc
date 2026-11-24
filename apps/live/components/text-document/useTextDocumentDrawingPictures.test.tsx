// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Drawn", "The picture's bar": each drawing's picture is drawn live into the
// host its picture hands in; a selected one's bar holds Edit (Open for anyone who cannot edit), which opens it where
// it is; outside an editor nothing is drawn.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { pictureView } from '@/lib/text-document/text-document-pictures';
import type { OpenDrawing } from '@/lib/text-document/text-document-drawing-open-plugin';

const editor = vi.hoisted(() => ({ value: {} as object | null }));
vi.mock('@/app/document/[id]/EditorContext', () => ({
  useOptionalEditorContext: () => editor.value,
}));
vi.mock('./TextDocumentDrawingPicture', () => ({
  TextDocumentDrawingPicture: ({ drawingTabId }: { drawingTabId: string }) => (
    <i data-drawn-tab={drawingTabId} />
  ),
}));
vi.mock('next/dynamic', () => ({
  default: (load: () => Promise<unknown>) => {
    let Loaded: React.ComponentType<Record<string, unknown>> | null = null;
    void load().then((c) => (Loaded = c as never));
    return (props: Record<string, unknown>) => (Loaded ? <Loaded {...props} /> : null);
  },
}));

const { drawingHostStore, useTextDocumentDrawingPictures } =
  await import('./useTextDocumentDrawingPictures');

const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((v) => {
    v.dom.remove();
    v.destroy();
  });
});
beforeEach(() => {
  editor.value = {};
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
});

function setup({
  canEdit = true,
  open = vi.fn<OpenDrawing>(),
}: { canEdit?: boolean; open?: OpenDrawing | null } = {}) {
  const store = drawingHostStore();
  const pictures = ['d1', null].map((drawing) =>
    schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 30, drawing }),
  );
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, pictures)]);
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 1) }),
    nodeViews: {
      [PICTURE]: pictureView({
        media: () => ({ mediaType: 'image/png', bytes: new Uint8Array([1]) }),
        gallery: async () => null,
        release: () => {},
        drawing: store.attach,
      }),
    },
  });
  views.push(view);
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  function Harness() {
    return <>{useTextDocumentDrawingPictures({ store, view, canEdit, subscribe, open })}</>;
  }
  const harness = render(<Harness />);
  const select = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
      listeners.forEach((l) => l());
    });
  return { view, harness, select, open, store };
}

describe('useTextDocumentDrawingPictures', () => {
  it("draws each drawing into its picture's host", async () => {
    const { view } = setup();
    await waitFor(() => expect(view.dom.querySelector('[data-drawn-tab="d1"]')).not.toBeNull());
    expect(view.dom.querySelectorAll('[data-drawn-tab]')).toHaveLength(1);
  });

  it('puts Edit under a selected drawing, opening it where it is', () => {
    const { select, open, view } = setup();
    expect(screen.queryByRole('toolbar', { name: 'Drawing' })).toBeNull();
    select(1);
    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(view.nodeDOM(1)!.contains(edit)).toBe(true);
    fireEvent.click(edit);
    expect(open).toHaveBeenCalledWith('d1', 1);
  });

  it('offers Open to anyone who cannot edit, and no bar on a plain picture', () => {
    const { select } = setup({ canEdit: false });
    select(1);
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    select(2);
    expect(screen.queryByRole('toolbar', { name: 'Drawing' })).toBeNull();
  });

  it('goes back to the writing on Escape from the bar', () => {
    const { select, view } = setup();
    select(1);
    const focus = vi.spyOn(view, 'focus');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Edit' }), { key: 'Escape' });
    expect(focus).toHaveBeenCalled();
  });

  it('draws no bar where no drawing may be opened, and nothing outside an editor', async () => {
    const closed = setup({ open: null });
    closed.select(1);
    expect(screen.queryByRole('toolbar', { name: 'Drawing' })).toBeNull();
    closed.harness.unmount();
    editor.value = null;
    const outside = setup();
    outside.select(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(outside.view.dom.querySelector('[data-drawn-tab]')).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Drawing' })).toBeNull();
  });
});

describe('drawingHostStore', () => {
  it('lists the hosts handed in, and forgets each given back', () => {
    const store = drawingHostStore();
    const told = vi.fn();
    store.subscribe(told);
    const hosts = {
      drawingTabId: 'd1',
      drawing: document.createElement('span'),
      bar: document.createElement('span'),
    };
    const release = store.attach(hosts);
    expect(store.hosts()).toEqual([{ ...hosts, key: '1' }]);
    release();
    expect(store.hosts()).toEqual([]);
    expect(told).toHaveBeenCalledTimes(2);
  });
});
