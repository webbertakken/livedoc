// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Drawn": each drawing's picture is drawn live into the host its picture
// hands in; outside an editor nothing is drawn.
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { pictureView } from '@/lib/text-document/text-document-pictures';

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

function setup() {
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
  function Harness() {
    return <>{useTextDocumentDrawingPictures({ store })}</>;
  }
  return { view, harness: render(<Harness />) };
}

describe('useTextDocumentDrawingPictures', () => {
  it("draws each drawing into its picture's host", async () => {
    const { view } = setup();
    await waitFor(() => expect(view.dom.querySelector('[data-drawn-tab="d1"]')).not.toBeNull());
    expect(view.dom.querySelectorAll('[data-drawn-tab]')).toHaveLength(1);
  });

  it('draws nothing outside an editor', async () => {
    editor.value = null;
    const outside = setup();
    await new Promise((r) => setTimeout(r, 0));
    expect(outside.view.dom.querySelector('[data-drawn-tab]')).toBeNull();
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
    };
    const release = store.attach(hosts);
    expect(store.hosts()).toEqual([{ ...hosts, key: '1' }]);
    release();
    expect(store.hosts()).toEqual([]);
    expect(told).toHaveBeenCalledTimes(2);
  });
});
