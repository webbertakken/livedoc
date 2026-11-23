// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Working with a picture", Cropping: a double-click on a picture, or Crop
// image, begins cropping it (for whoever may edit), marked on the picture; Enter, Escape or the selection moving off it
// ends cropping.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView, type Decoration, type DecorationSet } from 'prosemirror-view';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { setPictureCrop } from './text-document-picture-edit';
import {
  beginCropping,
  croppingAt,
  pictureCroppingPlugin,
} from './text-document-picture-cropping-plugin';

function setup(can = true) {
  const picture = schema.nodes[PICTURE]!.create({ media: 'm', width: 60, height: 30 });
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('ab'), picture, schema.text('cd')]),
  ]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1),
      plugins: [pictureCroppingPlugin({ can: () => can })],
    }),
  });
  return view;
}
const PICTURE_AT = 3;
const key = (view: EditorView, name: string) =>
  view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: name })));
const marks = (view: EditorView) =>
  (view.someProp('decorations', (f) => f(view.state)) as DecorationSet | null)
    ?.find()
    .map((d: Decoration): unknown => d.spec) ?? [];

describe('pictureCroppingPlugin', () => {
  it('begins cropping a picture, selecting it and marking it', () => {
    const view = setup();
    expect(beginCropping(view, PICTURE_AT)).toBe(true);
    expect(croppingAt(view.state)).toBe(PICTURE_AT);
    expect(view.state.selection.from).toBe(PICTURE_AT);
    expect(marks(view)).toEqual([{ cropping: true }]);
  });

  it('begins on a double-click on a picture, for whoever may edit alone', () => {
    const view = setup();
    const node = view.state.doc.nodeAt(PICTURE_AT)!;
    const click = (v: EditorView) =>
      v.someProp('handleDoubleClickOn', (f) =>
        f(v, PICTURE_AT, node, PICTURE_AT, new MouseEvent('dblclick'), true),
      );
    expect(click(view)).toBe(true);
    expect(croppingAt(view.state)).toBe(PICTURE_AT);
    const reader = setup(false);
    expect(click(reader)).toBeFalsy();
    expect(croppingAt(reader.state)).toBeNull();
  });

  it('refuses where no picture is', () => {
    const view = setup();
    expect(beginCropping(view, 1)).toBe(false);
    expect(croppingAt(view.state)).toBeNull();
  });

  it('ends on Enter and on Escape, taking the key', () => {
    for (const name of ['Enter', 'Escape']) {
      const view = setup();
      beginCropping(view, PICTURE_AT);
      expect(key(view, name)).toBe(true);
      expect(croppingAt(view.state)).toBeNull();
      expect(marks(view)).toEqual([]);
    }
  });

  it('leaves keys alone while not cropping', () => {
    expect(key(setup(), 'Enter')).toBeFalsy();
  });

  it('ends when the selection moves off the picture', () => {
    const view = setup();
    beginCropping(view, PICTURE_AT);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    expect(croppingAt(view.state)).toBeNull();
  });

  it('lasts while the picture itself is written, a crop kept selected', () => {
    const view = setup();
    beginCropping(view, PICTURE_AT);
    setPictureCrop(PICTURE_AT, {
      width: 45,
      height: 30,
      crop: { top: 0, right: 0.25, bottom: 0, left: 0 },
    })(view.state, view.dispatch);
    expect(croppingAt(view.state)).toBe(PICTURE_AT);
  });

  it('follows the picture as the writing before it changes', () => {
    const view = setup();
    beginCropping(view, PICTURE_AT);
    view.dispatch(view.state.tr.insertText('x', 1));
    expect(croppingAt(view.state)).toBe(PICTURE_AT + 1);
  });
});
