// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Working with a picture": Image options and Reset image are an Editor's,
// dimmed while no picture is selected; its own size is its pixels (held bytes, else the image drawn); a size from the
// panel or the handles, and Reset image, each written as one step and counted.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

import { PICTURE_DRAWN_EVENT } from '@/lib/text-document/text-document-pictures';

const { useTextDocumentPictureSize } = await import('./useTextDocumentPictureSize');

// A PNG's header: 160 by 80 pixels, so its own size is 120 by 60 points.
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 160,
  0, 0, 0, 80, 8, 2, 0, 0, 0,
]);
const room = { width: 468, height: 648 };

function setup({ selected = true, canEdit = true, held = true, drawn = false } = {}) {
  const picture = schema.nodes[PICTURE]!.create({
    media: 'm',
    width: 60,
    height: 30,
    crop: { top: 0.1, right: 0, bottom: 0, left: 0 },
  });
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [picture])]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: selected ? NodeSelection.create(doc, 1) : TextSelection.create(doc, 2),
    }),
  });
  const live = TextDocumentState.load();
  TextDocumentState.addMedia(live, {
    m: held ? { mediaType: 'image/png', bytes: PNG } : { mediaType: 'image/png', image: 'img-1' },
  });
  if (drawn)
    Object.assign((view.nodeDOM(1) as HTMLElement).dataset, { ownWidth: '320', ownHeight: '160' });
  const toggle = { run: vi.fn() };
  const hook = renderHook(() =>
    useTextDocumentPictureSize({
      view,
      liveDoc: { current: live },
      canEdit,
      subscribe: () => () => {},
      toggle,
      room,
    }),
  );
  return { hook, view, toggle };
}
const attrs = (view: EditorView) => view.state.doc.nodeAt(1)!.attrs;

beforeEach(() => track.mockReset());

describe('useTextDocumentPictureSize', () => {
  it('dims its items while no picture is selected', () => {
    const { actions } = setup({ selected: false }).hook.result.current;
    expect(actions['image-options']?.disabled).toBe(true);
    expect(actions['image-reset']?.disabled).toBe(true);
  });

  it('binds nothing for anyone who may not edit', () => {
    expect(setup({ canEdit: false }).hook.result.current.actions).toEqual({});
  });

  it("opens the panel by the panel's own binding", () => {
    const { hook, toggle } = setup();
    hook.result.current.actions['image-options']!.run();
    expect(toggle.run).toHaveBeenCalledOnce();
  });

  it('reads its size and its own size from its held bytes', () => {
    expect(setup().hook.result.current.picture).toMatchObject({
      width: 60,
      height: 30,
      own: { width: 120, height: 60 },
    });
  });

  it('reads a gallery picture its own size from the image drawn, and none before it is', () => {
    expect(setup({ held: false }).hook.result.current.picture?.own).toBeNull();
    expect(setup({ held: false }).hook.result.current.actions['image-reset']?.disabled).toBe(true);
    expect(setup({ held: false, drawn: true }).hook.result.current.picture?.own).toEqual({
      width: 240,
      height: 120,
    });
  });

  it('reads its own size again once its image is drawn', () => {
    const { hook, view } = setup({ held: false });
    expect(hook.result.current.picture?.own).toBeNull();
    const dom = view.nodeDOM(1) as HTMLElement;
    Object.assign(dom.dataset, { ownWidth: '320', ownHeight: '160' });
    act(() => {
      dom.dispatchEvent(new Event(PICTURE_DRAWN_EVENT, { bubbles: true }));
    });
    expect(hook.result.current.picture?.own).toEqual({ width: 240, height: 120 });
  });

  it("writes the panel's size, the ratio locked, counted", () => {
    const { hook, view } = setup();
    act(() => hook.result.current.apply({ field: 'width', value: 90 }, true));
    expect(attrs(view)).toMatchObject({ width: 90, height: 45 });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentImageSize');
  });

  it("writes the handles' size, counted", () => {
    const { hook, view } = setup();
    act(() => hook.result.current.resize(1, { width: 100, height: 20 }, 'handle'));
    expect(attrs(view)).toMatchObject({ width: 100, height: 20 });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentImageSize');
  });

  it('counts nothing when the size is the same', () => {
    const { hook } = setup();
    act(() => hook.result.current.resize(1, { width: 60, height: 30 }, 'handle'));
    expect(track).not.toHaveBeenCalled();
  });

  it('resets it to its own size, its crop dropped, counted', () => {
    const { hook, view } = setup();
    act(() => hook.result.current.actions['image-reset']!.run());
    expect(attrs(view)).toMatchObject({ width: 120, height: 60, crop: null });
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentImageReset');
  });

  it('writes nothing for anyone who may not edit', () => {
    const { hook, view } = setup({ canEdit: false });
    act(() => hook.result.current.resize(1, { width: 100, height: 20 }, 'handle'));
    act(() => hook.result.current.reset());
    expect(attrs(view)).toMatchObject({ width: 60, height: 30 });
  });
});
