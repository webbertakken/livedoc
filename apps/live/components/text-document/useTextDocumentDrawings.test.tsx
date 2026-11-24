// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Inserting and editing", "Where it goes", "Its picture", "Telemetry":
// Insert > Drawing > New keeps the caret's place and opens a drawing tab; the drawing's picture, once made, is placed
// there at its drawn size, naming its drawing tab, and counted.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import {
  drawingPending,
  drawingReady,
  putDrawingPending,
  takeDrawing,
} from '@/lib/text-document/text-document-drawing-pending';
import type { PicturePlacing } from '@/lib/text-document/text-document-picture-place';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTextDocumentDrawings, DRAWING_NEW_ITEM } = await import('./useTextDocumentDrawings');

// A 200 x 100 PNG's header: drawn at 100 x 75 points (twice its size, at 96 dpi).
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 200,
  0, 0, 0, 100, 8, 2, 0, 0, 0,
]);

let views: EditorView[] = [];
function setup(
  options: { canEdit?: boolean; shownTab?: string; create?: () => string | null } = {},
) {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('Hello')]),
  ]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 3) }),
  });
  views.push(view);
  const liveDoc = TextDocumentState.load();
  const placing: PicturePlacing = {
    view: () => view,
    doc: () => liveDoc,
    room: () => ({ width: 468, height: 648 }),
    onRefused: vi.fn(),
  };
  const showTab = { current: vi.fn() };
  const create = options.create ?? vi.fn(() => 'd1');
  const hook = renderHook(() =>
    useTextDocumentDrawings({
      view,
      tabId: 'w',
      canEdit: options.canEdit ?? true,
      shownTab: options.shownTab ?? 't.0',
      showTab,
      placing,
      create,
    }),
  );
  return { hook, view, showTab, create, liveDoc };
}

beforeEach(() => {
  sessionStorage.clear();
  takeDrawing('d1');
  track.mockReset();
});
afterEach(() => {
  for (const view of views) view.destroy();
  views = [];
});

describe('useTextDocumentDrawings', () => {
  it('starts a drawing for an Editor, keeping where it goes', () => {
    const { hook, create } = setup();
    hook.result.current[DRAWING_NEW_ITEM]!.run();
    expect(create).toHaveBeenCalledTimes(1);
    expect(drawingPending('d1')).toMatchObject({ textDocumentTabId: 'w', documentTab: 't.0' });
  });

  it('binds nothing for anyone who may not edit the body', () => {
    expect(setup({ canEdit: false }).hook.result.current).toEqual({});
  });

  it('keeps nothing when no drawing tab could be added', () => {
    const { hook } = setup({ create: () => null });
    hook.result.current[DRAWING_NEW_ITEM]!.run();
    expect(drawingPending('d1')).toBeNull();
  });

  it('places a ready drawing at its drawn size, naming its tab, and counts it once', async () => {
    putDrawingPending('d1', { textDocumentTabId: 'w', documentTab: 't.0', anchor: null });
    drawingReady('d1', { bytes: PNG, stored: 'img-1' });
    const { view, liveDoc } = setup();
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentDrawing'),
    );
    let picture: { attrs: Record<string, unknown> } | null = null;
    view.state.doc.descendants((node) => {
      if (node.type.name === PICTURE) picture = node;
    });
    expect(picture!.attrs).toMatchObject({ drawing: 'd1', width: 75, height: 37.5 });
    expect(TextDocumentState.media(liveDoc, picture!.attrs.media as string)).toMatchObject({
      image: 'img-1',
    });
    expect(drawingPending('d1')).toBeNull();
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('shows the drawing’s document tab first', () => {
    putDrawingPending('d1', { textDocumentTabId: 'w', documentTab: 't.1', anchor: null });
    drawingReady('d1', { bytes: PNG, stored: null });
    const { showTab } = setup();
    expect(showTab.current).toHaveBeenCalledWith('t.1');
  });

  it('leaves another text document’s drawing alone', () => {
    putDrawingPending('d1', { textDocumentTabId: 'v', documentTab: 't.0', anchor: null });
    drawingReady('d1', { bytes: PNG, stored: null });
    setup();
    expect(drawingPending('d1')).not.toBeNull();
  });
});
