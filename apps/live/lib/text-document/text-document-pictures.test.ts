// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "In the editor": a picture in line drawn at its size, its crop cutting its
// media; its alternative text read, a decorative one read as nothing; one without media a grey box reading so;
// selected, its handles; while cropped, its crop marks. A turned picture is drawn turned about its centre, its line making
// room for its bounds, its handles read along its own sides.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { Decoration, EditorView } from 'prosemirror-view';
import { CROPPING_SPEC } from './text-document-picture-cropping-plugin';
import type { CroppedPicture } from './text-document-picture-crop';
import { PICTURE, type PictureMedia } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import {
  PICTURE_DRAWN_EVENT,
  pictureBox,
  pictureView,
  type PictureSource,
} from './text-document-pictures';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const picture = (attrs: Record<string, unknown>) =>
  textDocumentSchema.nodes[PICTURE]!.create({ media: 'k', width: 60, height: 40, ...attrs });

describe('pictureBox', () => {
  it('draws the whole picture at its size without a crop', () => {
    expect(pictureBox(picture({}).attrs)).toEqual({
      width: 60,
      height: 40,
      image: { width: 60, height: 40, left: 0, top: 0 },
      rotation: 0,
      bounds: { width: 60, height: 40 },
    });
  });

  it('turns the picture, its bounds those of the turned box', () => {
    expect(pictureBox(picture({ rotation: 90 }).attrs)).toMatchObject({
      width: 60,
      height: 40,
      rotation: 90,
      bounds: { width: 40, height: 60 },
    });
    expect(pictureBox(picture({ rotation: 30 }).attrs).bounds).toEqual({
      width: 71.962,
      height: 64.641,
    });
    expect(pictureBox(picture({ rotation: 'x' }).attrs).rotation).toBe(0);
  });

  it('draws the picture larger, moved by the crop, so only what is left shows', () => {
    const crop = { top: 0.2, right: 0.1, bottom: 0.0, left: 0.1 };
    expect(pictureBox(picture({ crop }).attrs)).toEqual({
      width: 60,
      height: 40,
      image: { width: 75, height: 50, left: -7.5, top: -10 },
      rotation: 0,
      bounds: { width: 60, height: 40 },
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

  it('draws a turned picture turned about its centre, its line making room for its bounds', () => {
    const dom = draw({ rotation: 90 });
    expect(dom.style.width).toBe('40pt');
    expect(dom.style.height).toBe('60pt');
    const turned = dom.querySelector<HTMLElement>('.text-document-picture-turn')!;
    expect(turned.style.width).toBe('60pt');
    expect(turned.style.height).toBe('40pt');
    expect(turned.style.left).toBe('-10pt');
    expect(turned.style.top).toBe('10pt');
    expect(turned.style.transform).toBe('rotate(90deg)');
    expect(
      draw({}).querySelector<HTMLElement>('.text-document-picture-turn')!.style.transform,
    ).toBe('');
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

  // objects.md "Working with a picture": its own size is its pixels, noted once its image is drawn.
  it('notes its own pixels once its image is drawn, and says so', () => {
    const dom = draw({});
    const told = vi.fn();
    dom.addEventListener(PICTURE_DRAWN_EVENT, told);
    const img = dom.querySelector('img')!;
    Object.defineProperties(img, { naturalWidth: { value: 320 }, naturalHeight: { value: 160 } });
    img.dispatchEvent(new Event('load'));
    expect(dom.dataset).toMatchObject({ ownWidth: '320', ownHeight: '160' });
    expect(told).toHaveBeenCalledOnce();
  });

  // objects.md "Working with a picture", Sizing by its handles: eight handles on a selected picture; the box follows the
  // pointer, the size written once on release; Escape leaves it as it was.
  describe('its handles', () => {
    const room = { width: 468, height: 648 };
    const cropMark = [Decoration.node(0, 1, {}, CROPPING_SPEC)];
    const sized = (can = true, marks: readonly Decoration[] = [], attrs = {}) => {
      const resize = vi.fn<(pos: number, size: { width: number; height: number }) => void>();
      const crop = vi.fn<(pos: number, next: CroppedPicture) => void>();
      const rotate = vi.fn<(pos: number, rotation: number) => void>();
      const view = pictureView(sourceOf(held(true)), {
        can: () => can,
        room: () => room,
        resize,
        crop,
        rotate,
      })(picture(attrs), {} as EditorView, () => 3, marks, undefined as never);
      return { view, resize, crop, rotate };
    };
    const handle = (dom: HTMLElement, which: string) =>
      dom.querySelector<HTMLElement>(`[data-picture-handle="${which}"]`)!;
    // jsdom lays nothing out: a point is drawn as 4/3 of a pixel.
    const drag = (from: HTMLElement, dx: number, dy: number) => {
      from.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
      );
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10 + dx, clientY: 10 + dy }));
    };

    it('draws eight and the rotation handle on a selected picture, and none once deselected', () => {
      const { view } = sized();
      view.selectNode!();
      expect(view.dom.classList.contains('ProseMirror-selectednode')).toBe(true);
      expect(
        [...view.dom.querySelectorAll('[data-picture-handle]')].map((h) =>
          h.getAttribute('data-picture-handle'),
        ),
      ).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate']);
      view.deselectNode!();
      expect(view.dom.querySelector('[data-picture-handle]')).toBeNull();
      expect(view.dom.classList.contains('ProseMirror-selectednode')).toBe(false);
    });

    it('draws none for anyone who may not size it', () => {
      const { view } = sized(false);
      view.selectNode!();
      expect(view.dom.querySelector('[data-picture-handle]')).toBeNull();
    });

    it('follows the pointer, writing the size once on release', () => {
      const { view, resize } = sized();
      view.selectNode!();
      drag(handle(view.dom, 'se'), 52, 0);
      expect(view.dom.style.width).toBe('87pt');
      expect(resize).not.toHaveBeenCalled();
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      expect(resize).toHaveBeenCalledExactlyOnceWith(3, { width: 87, height: 58 });
    });

    it('leaves the picture as it was on Escape', () => {
      const { view, resize } = sized();
      view.selectNode!();
      drag(handle(view.dom, 'e'), 40, 0);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      expect(view.dom.style.width).toBe('60pt');
      expect(resize).not.toHaveBeenCalled();
    });

    // Turning by its handle: the picture follows the pointer round its centre, its line kept still, the turn written once.
    it('turns by the rotation handle, writing the turn once on release', () => {
      const { view, rotate, resize } = sized();
      view.selectNode!();
      // jsdom lays nothing out: the centre is at (0, 0), the handle pressed at 135° and moved to 225°.
      drag(handle(view.dom, 'rotate'), -20, 0);
      const turned = view.dom.querySelector<HTMLElement>('.text-document-picture-turn')!;
      expect(turned.style.transform).toBe('rotate(90deg)');
      expect(view.dom.style.width).toBe('60pt');
      expect(rotate).not.toHaveBeenCalled();
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      expect(rotate).toHaveBeenCalledExactlyOnceWith(3, 90);
      expect(resize).not.toHaveBeenCalled();
    });

    it('leaves the turn as it was on Escape', () => {
      const { view, rotate } = sized();
      view.selectNode!();
      drag(handle(view.dom, 'rotate'), -20, 0);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      expect(
        view.dom.querySelector<HTMLElement>('.text-document-picture-turn')!.style.transform,
      ).toBe('');
      expect(rotate).not.toHaveBeenCalled();
    });

    it("reads a turned picture's handle along its own sides", () => {
      const { view, resize } = sized(true, [], { rotation: 90 });
      view.selectNode!();
      // Turned a quarter clockwise, its east edge faces down: 40 pixels down is 30 points wider.
      drag(handle(view.dom, 'e'), 0, 40);
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      expect(resize).toHaveBeenCalledExactlyOnceWith(3, { width: 90, height: 40 });
    });

    // Cropping: the whole picture drawn, what lies beyond its box dimmed, a mark's drag cutting rather than scaling.
    it('draws the shade while cropping, and leaves it once done', () => {
      const { view } = sized(true, cropMark);
      view.selectNode!();
      expect(view.dom.classList.contains('text-document-picture-cropping')).toBe(true);
      expect(view.dom.querySelector('.text-document-picture-shade')).not.toBeNull();
      view.update!(picture({}), [], undefined as never);
      expect(view.dom.classList.contains('text-document-picture-cropping')).toBe(false);
      expect(view.dom.querySelector('.text-document-picture-shade')).toBeNull();
    });

    it('cuts a side by its crop mark, writing the crop once on release', () => {
      const { view, resize, crop } = sized(true, cropMark);
      view.selectNode!();
      // 20 pixels in: 15 of the 60 points cut from the right.
      drag(handle(view.dom, 'e'), -20, 0);
      expect(view.dom.style.width).toBe('45pt');
      expect(view.dom.querySelector('img')!.style.width).toBe('60pt');
      window.dispatchEvent(new MouseEvent('pointerup', {}));
      expect(crop).toHaveBeenCalledExactlyOnceWith(3, {
        width: 45,
        height: 40,
        crop: { top: 0, right: 0.25, bottom: 0, left: 0 },
      });
      expect(resize).not.toHaveBeenCalled();
    });

    it('keeps the editor away from its handles', () => {
      const { view } = sized();
      view.selectNode!();
      const event = new MouseEvent('mousedown', { bubbles: true });
      Object.defineProperty(event, 'target', { value: handle(view.dom, 'n') });
      expect(view.stopEvent!(event)).toBe(true);
      const elsewhere = new MouseEvent('mousedown');
      Object.defineProperty(elsewhere, 'target', { value: view.dom });
      expect(view.stopEvent!(elsewhere)).toBe(false);
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
