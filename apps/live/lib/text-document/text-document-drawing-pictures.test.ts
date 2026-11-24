// docs/specs/034-text-documents/objects.md "Its picture again": Save and close on a drawing already placed puts its new
// PNG in every picture naming it, each keeping its width, its height following the drawing's shape, its crop dropped.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  drawingOfPicture,
  drawingPicturesIn,
  refreshDrawingPictures,
} from './text-document-drawing-pictures';

const picture = (attrs: Record<string, unknown>) =>
  schema.nodes[PICTURE]!.create({ media: 'old', width: 60, height: 30, ...attrs });

function stateOf() {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [
      schema.text('a'),
      picture({ drawing: 'd1', crop: { top: 0.1, right: 0, bottom: 0, left: 0 } }),
      picture({}),
    ]),
    schema.nodes.paragraph!.create(null, [
      picture({ drawing: 'd1', width: 30 }),
      picture({ drawing: 'd2' }),
    ]),
  ]);
  return EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
}

describe('drawingOfPicture', () => {
  it("names a picture's drawing tab, and none for a plain picture or another node", () => {
    const of = (attrs: Record<string, unknown>, name = PICTURE) =>
      drawingOfPicture({ type: { name }, attrs });
    expect(of({ drawing: 'd' })).toBe('d');
    expect(of({ drawing: null })).toBeNull();
    expect(of({ drawing: '' })).toBeNull();
    expect(of({ drawing: 'd' }, 'paragraph')).toBeNull();
  });
});

describe('drawingPicturesIn', () => {
  it('finds the pictures naming a drawing, in order', () => {
    const { doc } = stateOf();
    expect(drawingPicturesIn(doc, 'd1')).toEqual([2, 6]);
    expect(drawingPicturesIn(doc, 'd2')).toEqual([7]);
    expect(drawingPicturesIn(doc, 'none')).toEqual([]);
  });
});

describe('refreshDrawingPictures', () => {
  const media = { key: 'new', pixels: { width: 200, height: 50 } };

  it("puts the new picture in each, keeping its width, its height by the drawing's shape, its crop dropped", () => {
    let state = stateOf();
    expect(refreshDrawingPictures('d1', media)(state, (tr) => (state = state.apply(tr)))).toBe(
      true,
    );
    const at = (pos: number) => state.doc.nodeAt(pos)!.attrs;
    expect(at(2)).toMatchObject({ media: 'new', width: 60, height: 15, crop: null, drawing: 'd1' });
    expect(at(6)).toMatchObject({ media: 'new', width: 30, height: 7.5 });
    expect(at(3)).toMatchObject({ media: 'old' });
    expect(at(7)).toMatchObject({ media: 'old' });
    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect(state.selection.from).toBe(2);
  });

  it('refuses where no picture names it, or the picture has no size', () => {
    const state = stateOf();
    expect(refreshDrawingPictures('none', media)(state)).toBe(false);
    expect(
      refreshDrawingPictures('d1', { key: 'new', pixels: { width: 0, height: 5 } })(state),
    ).toBe(false);
  });
});
