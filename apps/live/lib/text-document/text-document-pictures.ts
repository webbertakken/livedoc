// Pictures in line in the editor (docs/specs/034-text-documents/objects.md "In the editor"): one atom of its paragraph,
// drawn at its size from its media in the live state's `media` map, its crop cutting the picture drawn larger behind a
// box of that size; read by its alternative text, a decorative one as nothing; a grey box when its media is missing.
// A gallery media is drawn from the gallery image it names (objects.md "Where the bytes live").
import type { Node as PmNode, NodeSpec } from 'prosemirror-model';
import type { NodeView, NodeViewConstructor } from 'prosemirror-view';
import { PICTURE_ATTRIBUTES, type PictureCrop, type PictureMedia } from '@livedoc/text-documents';

/** What a picture shows when its media is not in the state. */
export const PICTURE_MISSING_TEXT = 'Picture, not loaded';

const nullAttributes = (names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, { default: null }]));

const length = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100_000 ? value : 0;
const share = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1 ? value : 0;
const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** The box a picture takes, in points, and the picture drawn inside it: larger by its crop, moved by its top and left. */
export function pictureBox(attrs: Readonly<Record<string, unknown>>): {
  width: number;
  height: number;
  image: { width: number; height: number; left: number; top: number };
} {
  const width = length(attrs.width);
  const height = length(attrs.height);
  const crop = (attrs.crop ?? {}) as Partial<PictureCrop>;
  const [top, right, bottom, left] = [crop.top, crop.right, crop.bottom, crop.left].map(share) as [
    number,
    number,
    number,
    number,
  ];
  const across = left + right < 1 ? 1 - left - right : 1;
  const down = top + bottom < 1 ? 1 - top - bottom : 1;
  const image = { width: round3(width / across), height: round3(height / down) };
  return {
    width,
    height,
    image: { ...image, left: round3(-left * image.width), top: round3(-top * image.height) },
  };
}

const boxStyle = (attrs: Readonly<Record<string, unknown>>) => {
  const box = pictureBox(attrs);
  return `width: ${box.width}pt; height: ${box.height}pt`;
};

/** The schema's picture: one atom, read as no text; its static form is the box (a copy carries it as its values). */
export const pictureNodeSpec: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  attrs: nullAttributes(PICTURE_ATTRIBUTES),
  leafText: () => '',
  toDOM: (node) => [
    'span',
    {
      class: 'text-document-picture',
      contenteditable: 'false',
      'data-media': typeof node.attrs.media === 'string' ? node.attrs.media : '',
      style: boxStyle(node.attrs),
    },
  ],
};

/**
 * Where a picture's bytes are read from (objects.md "Where the bytes live"): the state's media by key, and a gallery
 * image's URL by its id, under the placement rules (null when the reader may not be served it), given back with
 * `release` once no view shows it.
 */
export type PictureSource = {
  readonly media: (key: string) => PictureMedia | undefined;
  readonly gallery: (imageId: string) => Promise<string | null>;
  readonly release: (url: string) => void;
};

/** The node view drawing each picture from its media: held bytes as an object URL, a gallery image as its URL. */
export function pictureView(source: PictureSource): NodeViewConstructor {
  return (node: PmNode): NodeView => {
    const dom = document.createElement('span');
    dom.contentEditable = 'false';
    dom.className = 'text-document-picture';
    // What is shown, and how to give it back: an object URL is revoked, a gallery URL released.
    let shown: { key: string; url?: string; give?: () => void } | undefined;
    let current = node;
    let destroyed = false;
    const giveBack = () => {
      shown?.give?.();
      shown = undefined;
    };
    const fit = (picture: PmNode) => {
      const attrs = picture.attrs;
      const box = pictureBox(attrs);
      const img = dom.querySelector('img');
      if (!img) return;
      img.alt = attrs.decorative === true ? '' : typeof attrs.alt === 'string' ? attrs.alt : '';
      img.style.width = `${box.image.width}pt`;
      img.style.height = `${box.image.height}pt`;
      img.style.left = `${box.image.left}pt`;
      img.style.top = `${box.image.top}pt`;
    };
    const showImage = (url: string) => {
      dom.classList.remove('text-document-picture-missing');
      const img = document.createElement('img');
      img.src = url;
      img.draggable = false;
      dom.replaceChildren(img);
      fit(current);
    };
    const showMissing = () => {
      dom.classList.add('text-document-picture-missing');
      dom.textContent = PICTURE_MISSING_TEXT;
    };
    const load = (key: string) => {
      giveBack();
      dom.replaceChildren();
      dom.classList.remove('text-document-picture-missing');
      const media = source.media(key);
      if (!media) {
        shown = { key };
        return showMissing();
      }
      if (media.bytes) {
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(media.bytes)], { type: media.mediaType }),
        );
        shown = { key, url, give: () => URL.revokeObjectURL(url) };
        return showImage(url);
      }
      const wanted = { key };
      shown = wanted;
      void source.gallery(media.image).then(
        (url) => {
          // Destroyed, or showing another media by now: the URL is no one's.
          if (destroyed || shown !== wanted) {
            if (url) source.release(url);
            return;
          }
          if (!url) return showMissing();
          shown = { key, url, give: () => source.release(url) };
          showImage(url);
        },
        () => {
          if (!destroyed && shown === wanted) showMissing();
        },
      );
    };
    const draw = (picture: PmNode) => {
      current = picture;
      const key = typeof picture.attrs.media === 'string' ? picture.attrs.media : '';
      const box = pictureBox(picture.attrs);
      dom.dataset.media = key;
      dom.style.width = `${box.width}pt`;
      dom.style.height = `${box.height}pt`;
      if (key !== shown?.key) load(key);
      else fit(picture);
    };
    draw(node);
    return {
      dom,
      update: (next) => {
        if (next.type !== node.type) return false;
        draw(next);
        return true;
      },
      ignoreMutation: () => true,
      destroy: () => {
        destroyed = true;
        giveBack();
      },
    };
  };
}
