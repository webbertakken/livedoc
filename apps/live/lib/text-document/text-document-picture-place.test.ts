// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Inserting": a file is stored in the gallery, or keeps its bytes where the
// gallery cannot hold it (images_unavailable, This Browser); any other refusal places nothing and says why.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { mediaKeyOf } from '@livedoc/office-packages';
import { PICTURE, TextDocumentState } from '@livedoc/text-documents';
import { ImageUploadError } from '@/lib/upload-image';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  PICTURE_UNREADABLE,
  placePictureFile,
  placeStoredPicture,
  storeOrKeep,
  type PicturePlacing,
} from './text-document-picture-place';

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 160,
  0, 0, 0, 80, 8, 2, 0, 0, 0,
]);

function setup() {
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [schema.text('ab')])]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, 2) }),
  });
  const live = TextDocumentState.load();
  const onRefused = vi.fn();
  const placing: PicturePlacing = {
    view: () => view,
    doc: () => live,
    room: () => ({ width: 468, height: 648 }),
    onRefused,
  };
  const picture = () => {
    let found: { attrs: Record<string, unknown> } | undefined;
    view.state.doc.descendants((n) => {
      if (n.type.name === PICTURE) found = n;
    });
    return found;
  };
  return { view, live, placing, onRefused, picture };
}

const file = (bytes: Uint8Array) => new File([bytes.slice()], 'p.png', { type: 'image/png' });

describe('placePictureFile', () => {
  it('stores the file in the gallery and places it at the caret, at its size', async () => {
    const { live, placing, picture } = setup();
    const placed = await placePictureFile(placing, file(PNG), async () => 'img-1');
    expect(placed).toBe(true);
    const key = await mediaKeyOf(PNG);
    expect(picture()?.attrs).toMatchObject({ media: key, width: 120, height: 60 });
    expect(TextDocumentState.media(live, key)).toEqual({ mediaType: 'image/png', image: 'img-1' });
  });

  it('keeps the bytes where the gallery cannot hold it', async () => {
    const { live, placing } = setup();
    await placePictureFile(placing, file(PNG), async () => null);
    expect(TextDocumentState.media(live, await mediaKeyOf(PNG))).toEqual({
      mediaType: 'image/png',
      bytes: PNG,
    });
  });

  it('places nothing, and says why, when the store refuses it', async () => {
    const { placing, onRefused, picture } = setup();
    const refusal = new ImageUploadError('Your image gallery is full.', 'gallery_full');
    const placed = await placePictureFile(placing, file(PNG), () => Promise.reject(refusal));
    expect(placed).toBe(false);
    expect(onRefused).toHaveBeenCalledWith('Your image gallery is full.');
    expect(picture()).toBeUndefined();
  });

  it('says a picture it cannot read could not be read', async () => {
    const { placing, onRefused } = setup();
    expect(await placeStoredPicture(placing, new TextEncoder().encode('no'), 'img-1')).toBe(false);
    expect(onRefused).toHaveBeenCalledWith(PICTURE_UNREADABLE);
  });
});

describe('storeOrKeep', () => {
  it('answers the gallery id, none on images_unavailable, and passes any other refusal on', async () => {
    expect(await storeOrKeep(async () => ({ image: { id: 'img' } }))(file(PNG))).toBe('img');
    const unavailable = new ImageUploadError('Not here.', 'images_unavailable');
    expect(await storeOrKeep(() => Promise.reject(unavailable))(file(PNG))).toBeNull();
    const full = new ImageUploadError('Full.', 'gallery_full');
    await expect(storeOrKeep(() => Promise.reject(full))(file(PNG))).rejects.toBe(full);
  });
});
