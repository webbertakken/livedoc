// Pictures in line in the editor (docs/specs/034-text-documents/objects.md "In the editor"): one atom of its paragraph,
// drawn at its size from its media in the live state's `media` map, its crop cutting the picture drawn larger behind a
// box of that size; read by its alternative text, a decorative one as nothing; a grey box when its media is missing.
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

/** The node view drawing each picture from its media, which `mediaOf` reads from the live state by key. */
export function pictureView(
  mediaOf: (key: string) => PictureMedia | undefined,
): NodeViewConstructor {
  return (node: PmNode): NodeView => {
    const dom = document.createElement('span');
    dom.contentEditable = 'false';
    let url: string | undefined;
    let shown: string | undefined;
    const draw = (picture: PmNode) => {
      const attrs = picture.attrs;
      const key = typeof attrs.media === 'string' ? attrs.media : '';
      const box = pictureBox(attrs);
      dom.className = 'text-document-picture';
      dom.dataset.media = key;
      dom.style.width = `${box.width}pt`;
      dom.style.height = `${box.height}pt`;
      if (key !== shown) {
        if (url) URL.revokeObjectURL(url);
        url = undefined;
        shown = key;
        dom.replaceChildren();
        const media = mediaOf(key);
        if (media) {
          url = URL.createObjectURL(
            new Blob([new Uint8Array(media.bytes)], { type: media.mediaType }),
          );
          const img = document.createElement('img');
          img.src = url;
          img.draggable = false;
          dom.append(img);
        }
      }
      const img = dom.querySelector('img');
      if (!img) {
        dom.classList.add('text-document-picture-missing');
        dom.textContent = PICTURE_MISSING_TEXT;
        return;
      }
      img.alt = attrs.decorative === true ? '' : typeof attrs.alt === 'string' ? attrs.alt : '';
      img.style.width = `${box.image.width}pt`;
      img.style.height = `${box.image.height}pt`;
      img.style.left = `${box.image.left}pt`;
      img.style.top = `${box.image.top}pt`;
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
        if (url) URL.revokeObjectURL(url);
      },
    };
  };
}
