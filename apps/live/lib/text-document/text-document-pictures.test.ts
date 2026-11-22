// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "In the editor": a picture in line drawn at its size, its crop cutting its
// media; its alternative text read, a decorative one read as nothing; one without media a grey box reading so.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { PICTURE, type PictureMedia } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import { pictureBox, pictureView, type PictureSource } from './text-document-pictures';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const picture = (attrs: Record<string, unknown>) =>
  textDocumentSchema.nodes[PICTURE]!.create({ media: 'k', width: 60, height: 40, ...attrs });

describe('pictureBox', () => {
  it('draws the whole picture at its size without a crop', () => {
    expect(pictureBox(picture({}).attrs)).toEqual({
      width: 60,
      height: 40,
      image: { width: 60, height: 40, left: 0, top: 0 },
    });
  });

  it('draws the picture larger, moved by the crop, so only what is left shows', () => {
    const crop = { top: 0.2, right: 0.1, bottom: 0.0, left: 0.1 };
    expect(pictureBox(picture({ crop }).attrs)).toEqual({
      width: 60,
      height: 40,
      image: { width: 75, height: 50, left: -7.5, top: -10 },
    });
  });

  it('reads a size it cannot draw as none', () => {
    expect(pictureBox(picture({ width: 'x', height: -1 }).attrs)).toMatchObject({
      width: 0,
      height: 0,
    });
  });
});

describe('a picture drawn', () => {
  // jsdom has no object URLs; a browser makes one per picture drawn.
  beforeAll(() => {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:picture', revokeObjectURL: () => {} }),
    );
  });

  const held = (media: boolean) => (): PictureMedia | undefined =>
    media ? { mediaType: 'image/png', bytes: PNG } : undefined;
  const sourceOf = (
    media: (key: string) => PictureMedia | undefined,
    gallery: PictureSource['gallery'] = async () => null,
    release = vi.fn(),
  ): PictureSource => ({ media, gallery, release });
  const viewOf = (attrs: Record<string, unknown>, source: PictureSource) =>
    pictureView(source)(picture(attrs), {} as EditorView, () => 0, [], undefined as never);
  const draw = (attrs: Record<string, unknown>, media = true) =>
    viewOf(attrs, sourceOf(held(media))).dom;

  it('shows its media at its size, read by its alternative text', () => {
    const dom = draw({ alt: 'A green field' });
    expect(dom.style.width).toBe('60pt');
    expect(dom.style.height).toBe('40pt');
    const img = dom.querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('A green field');
    expect(img.getAttribute('src')).toMatch(/^blob:/);
  });

  it('reads a decorative picture as nothing', () => {
    expect(
      draw({ alt: 'Ignored', decorative: true }).querySelector('img')!.getAttribute('alt'),
    ).toBe('');
  });

  it('shows a grey box reading so when its media is missing', () => {
    const dom = draw({}, false);
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.textContent).toBe('Picture, not loaded');
    expect(dom.classList.contains('text-document-picture-missing')).toBe(true);
  });

  // objects.md "Where the bytes live": a gallery media is drawn from its image, under the placement rules.
  describe('from the gallery', () => {
    const gallery = (): PictureMedia => ({ mediaType: 'image/png', image: 'img-1' });
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('shows the image the gallery serves, and gives its URL back when gone', async () => {
      const release = vi.fn();
      const asked = vi.fn(async () => 'blob:gallery');
      const view = viewOf({ alt: 'Sky' }, sourceOf(gallery, asked, release));
      expect(view.dom.querySelector('img')).toBeNull();
      expect(view.dom.textContent).toBe('');
      await settled();
      expect(asked).toHaveBeenCalledWith('img-1');
      const img = view.dom.querySelector('img')!;
      expect(img.getAttribute('src')).toBe('blob:gallery');
      expect(img.getAttribute('alt')).toBe('Sky');
      view.destroy!();
      expect(release).toHaveBeenCalledWith('blob:gallery');
    });

    it('shows a picture the reader may not be served as missing', async () => {
      const view = viewOf(
        {},
        sourceOf(gallery, async () => null),
      );
      await settled();
      expect(view.dom.textContent).toBe('Picture, not loaded');
    });

    it('shows a picture the gallery fails to read as missing', async () => {
      const view = viewOf(
        {},
        sourceOf(gallery, () => Promise.reject(new Error('offline'))),
      );
      await settled();
      expect(view.dom.classList.contains('text-document-picture-missing')).toBe(true);
    });

    it('gives back a URL that arrives after the view is gone', async () => {
      const release = vi.fn();
      const view = viewOf(
        {},
        sourceOf(gallery, async () => 'blob:late', release),
      );
      view.destroy!();
      await settled();
      expect(release).toHaveBeenCalledWith('blob:late');
    });

    it('reads its image once while only its size changes', async () => {
      const asked = vi.fn(async () => 'blob:gallery');
      const view = viewOf({}, sourceOf(gallery, asked));
      await settled();
      view.update!(picture({ width: 90 }), [], undefined as never);
      await settled();
      expect(asked).toHaveBeenCalledTimes(1);
      expect(view.dom.style.width).toBe('90pt');
    });
  });
  it('is one atom of the paragraph, read as no text', () => {
    const state = EditorState.create({
      doc: textDocumentSchema.node('doc', null, [
        textDocumentSchema.node('paragraph', null, [textDocumentSchema.text('a'), picture({})]),
      ]),
    });
    expect(state.doc.textContent).toBe('a');
    expect(state.doc.firstChild!.childCount).toBe(2);
  });
});
