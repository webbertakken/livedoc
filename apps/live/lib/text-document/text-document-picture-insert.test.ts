// docs/specs/034-text-documents/objects.md "Inserting": a picture placed in line at the caret (or the drop point),
// replacing a selection and left selected, at its pixels at 96 an inch scaled down to fit the room, keeping its ratio;
// its media the gallery image it is stored as, or its bytes where the gallery cannot hold them.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { mediaKeyOf } from '@livedoc/office-packages';
import { PICTURE } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  insertedPictureSize,
  insertPicture,
  pictureFromBytes,
  pictureMediaOf,
  PICTURE_INSERT_DPI,
  pictureRoom,
} from './text-document-picture-insert';

/** A PNG's signature and header, `width` by `height`. */
const png = (width: number, height: number) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    0,
    0,
    (width >> 8) & 255,
    width & 255,
    0,
    0,
    (height >> 8) & 255,
    height & 255,
    8,
    2,
    0,
    0,
    0,
  ]);

describe('insertedPictureSize', () => {
  it('is its pixels at 96 an inch where it fits', () => {
    expect(PICTURE_INSERT_DPI).toBe(96);
    expect(insertedPictureSize({ width: 200, height: 100 }, { width: 468, height: 648 })).toEqual({
      width: 150,
      height: 75,
    });
  });

  it('scales down to the text width, keeping its ratio', () => {
    expect(insertedPictureSize({ width: 1248, height: 624 }, { width: 468, height: 648 })).toEqual({
      width: 468,
      height: 234,
    });
  });

  it('scales down to the text height when that is the tighter', () => {
    expect(insertedPictureSize({ width: 400, height: 1728 }, { width: 468, height: 648 })).toEqual({
      width: 150,
      height: 648,
    });
  });

  it('never makes a size of nothing', () => {
    expect(insertedPictureSize({ width: 1, height: 10_000 }, { width: 468, height: 648 })).toEqual({
      width: 0.065,
      height: 648,
    });
  });
});

describe('pictureFromBytes', () => {
  it('names its key, type and pixels', async () => {
    const bytes = png(300, 120);
    expect(await pictureFromBytes(bytes)).toEqual({
      ok: true,
      key: await mediaKeyOf(bytes),
      mediaType: 'image/png',
      pixels: { width: 300, height: 120 },
    });
  });

  it('refuses bytes that are no picture the model maps', async () => {
    expect(await pictureFromBytes(new TextEncoder().encode('<svg/>'))).toEqual({
      ok: false,
      error: 'unsupported_type',
    });
  });
});

describe('pictureMediaOf', () => {
  const bytes = png(2, 2);

  it('names the gallery image an upload stored', () => {
    expect(pictureMediaOf('image/png', bytes, 'img-1')).toEqual({
      mediaType: 'image/png',
      image: 'img-1',
    });
  });

  it('holds the bytes of a picture embedded in This Browser, or stored nowhere', () => {
    expect(pictureMediaOf('image/png', bytes, 'data:image/png;base64,AA==')).toEqual({
      mediaType: 'image/png',
      bytes,
    });
    expect(pictureMediaOf('image/png', bytes, null)).toEqual({ mediaType: 'image/png', bytes });
  });
});

describe('insertPicture', () => {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, [schema.text('Hello world')]),
  ]);
  const picture = { key: 'k1', width: 30, height: 20 };

  it('places it at the caret and leaves it selected', () => {
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 6) });
    insertPicture(picture)(state, (tr) => {
      state = state.apply(tr);
    });
    const para = state.doc.firstChild!;
    expect(para.childCount).toBe(3);
    expect(para.child(1).type.name).toBe(PICTURE);
    expect(para.child(1).attrs).toMatchObject({ media: 'k1', width: 30, height: 20 });
    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs.media).toBe('k1');
  });

  // objects.md "Drawings": a drawing's picture names its drawing tab.
  it('names the drawing tab of a drawing’s picture, and none for any other', () => {
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 6) });
    insertPicture({ ...picture, drawing: 'tab-d1' })(state, (tr) => {
      state = state.apply(tr);
    });
    expect(state.doc.firstChild!.child(1).attrs.drawing).toBe('tab-d1');
    expect(schema.nodes[PICTURE]!.create({ media: 'k', width: 1, height: 1 }).attrs.drawing).toBe(
      null,
    );
  });

  it('replaces a selection', () => {
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 7) });
    insertPicture(picture)(state, (tr) => {
      state = state.apply(tr);
    });
    expect(state.doc.textContent).toBe('world');
    expect(state.doc.firstChild!.firstChild!.type.name).toBe(PICTURE);
  });

  it('places it at a drop point', () => {
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
    insertPicture(picture, 12)(state, (tr) => {
      state = state.apply(tr);
    });
    expect(state.doc.firstChild!.lastChild!.type.name).toBe(PICTURE);
    expect(state.doc.textContent).toBe('Hello world');
  });

  it('refuses a drop point no picture can sit at', () => {
    const state = EditorState.create({ doc });
    expect(insertPicture(picture, 0)(state)).toBe(false);
  });
});

describe('pictureRoom', () => {
  it("is the column's width and the page's text height", () => {
    const setup = {
      width: 612,
      height: 792,
      orientation: 'portrait' as const,
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    };
    expect(pictureRoom(setup)).toEqual({ width: 468, height: 648 });
    expect(pictureRoom({ ...setup, columns: { count: 2, gap: 36 } })).toEqual({
      width: 216,
      height: 648,
    });
  });
});
