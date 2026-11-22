// docs/specs/034-text-documents/objects.md "Working with a picture": the selected picture; its alternative text and
// decorative mark written as one step; its media replaced, keeping its text, title, mark and width, its height
// following the new picture's ratio and its crop dropped.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { replacePictureMedia, selectedPicture, setPictureAlt } from './text-document-picture-edit';

const picture = schema.nodes[PICTURE]!.create({
  media: 'old',
  width: 120,
  height: 60,
  alt: 'A field',
  title: 'Field',
  crop: { top: 0.1, right: 0, bottom: 0, left: 0 },
});
const doc = schema.node('doc', null, [
  schema.nodes.paragraph!.create(null, [schema.text('a'), picture, schema.text('b')]),
]);
const selected = () => EditorState.create({ doc, selection: NodeSelection.create(doc, 2) });
const run = (state: EditorState, command: ReturnType<typeof setPictureAlt>) => {
  let next = state;
  const ran = command(state, (tr) => {
    next = state.apply(tr);
  });
  return { ran, next, attrs: next.doc.nodeAt(2)!.attrs };
};

describe('selectedPicture', () => {
  it('is the picture a selection holds whole, else none', () => {
    expect(selectedPicture(selected())).toMatchObject({ pos: 2 });
    expect(
      selectedPicture(EditorState.create({ doc, selection: TextSelection.create(doc, 1) })),
    ).toBeNull();
  });
});

describe('setPictureAlt', () => {
  it('writes the description, keeping the picture selected', () => {
    const { ran, next, attrs } = run(
      selected(),
      setPictureAlt(2, { alt: 'A green field', decorative: false }),
    );
    expect(ran).toBe(true);
    expect(attrs).toMatchObject({ alt: 'A green field', decorative: null, media: 'old' });
    expect(selectedPicture(next)?.pos).toBe(2);
  });

  it('marks it decorative, its description emptied', () => {
    const { attrs } = run(selected(), setPictureAlt(2, { alt: 'ignored', decorative: true }));
    expect(attrs).toMatchObject({ alt: null, decorative: true });
  });

  it('clears an empty description', () => {
    expect(
      run(selected(), setPictureAlt(2, { alt: '  ', decorative: false })).attrs.alt,
    ).toBeNull();
  });

  it('refuses a place that holds no picture', () => {
    expect(setPictureAlt(1, { alt: 'x', decorative: false })(selected())).toBe(false);
  });
});

describe('replacePictureMedia', () => {
  it('keeps its text, title and width; its height follows the new ratio; its crop goes', () => {
    const { attrs } = run(
      selected(),
      replacePictureMedia(2, { key: 'new', pixels: { width: 300, height: 300 } }),
    );
    expect(attrs).toMatchObject({
      media: 'new',
      width: 120,
      height: 120,
      alt: 'A field',
      title: 'Field',
      crop: null,
    });
  });

  it('refuses a place that holds no picture', () => {
    expect(
      replacePictureMedia(0, { key: 'new', pixels: { width: 1, height: 1 } })(selected()),
    ).toBe(false);
  });
});
