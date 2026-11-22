// Pictures in line in the editor (docs/specs/034-text-documents/objects.md "In the editor"): one atom of its paragraph,
// drawn at its size from its media in the live state's `media` map, its crop cutting the picture drawn larger behind a
// box of that size; read by its alternative text, a decorative one as nothing; a grey box when its media is missing.
// A gallery media is drawn from the gallery image it names (objects.md "Where the bytes live"). Selected, it is sized
// by its handles (objects.md "Working with a picture").
import type { Node as PmNode, NodeSpec } from 'prosemirror-model';
import type { NodeView, NodeViewConstructor } from 'prosemirror-view';
import { PICTURE_ATTRIBUTES, type PictureCrop, type PictureMedia } from '@livedoc/text-documents';
import {
  PICTURE_HANDLES,
  resizedPicture,
  type PictureHandle,
  type PictureSize,
} from './text-document-picture-size';

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

/**
 * How a selected picture is sized by its handles (objects.md "Working with a picture"): whether the reader may, the
 * room the text has (points), and the size written on release, at the picture's position then.
 */
export type PictureSizingHooks = {
  readonly can: () => boolean;
  readonly room: () => PictureSize;
  readonly resize: (pos: number, size: PictureSize) => void;
};

// A point is drawn as 4/3 of a pixel where nothing is laid out to measure.
const PIXELS_A_POINT = 96 / 72;

/**
 * The node view drawing each picture from its media: held bytes as an object URL, a gallery image as its URL, clipped
 * to its box; selected, its eight handles for whoever may size it (`sizing`). It notes the drawn image's own pixels.
 */
export function pictureView(
  source: PictureSource,
  sizing?: PictureSizingHooks,
): NodeViewConstructor {
  return (node: PmNode, _view, getPos): NodeView => {
    const dom = document.createElement('span');
    dom.contentEditable = 'false';
    dom.className = 'text-document-picture';
    const clip = document.createElement('span');
    clip.className = 'text-document-picture-clip';
    dom.append(clip);
    // What is shown, and how to give it back: an object URL is revoked, a gallery URL released.
    let shown: { key: string; url?: string; give?: () => void } | undefined;
    let current = node;
    let destroyed = false;
    let handles: HTMLElement | null = null;
    // Ends a drag under way: written, or left as it was.
    let endDrag: ((write: boolean) => void) | null = null;
    const giveBack = () => {
      shown?.give?.();
      shown = undefined;
    };
    // The box and the picture in it at a size: the picture's own, or a drag's.
    const fit = (attrs: Readonly<Record<string, unknown>>) => {
      const box = pictureBox(attrs);
      dom.style.width = `${box.width}pt`;
      dom.style.height = `${box.height}pt`;
      const img = clip.querySelector('img');
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
      img.addEventListener('load', () => {
        dom.dataset.ownWidth = String(img.naturalWidth);
        dom.dataset.ownHeight = String(img.naturalHeight);
      });
      clip.replaceChildren(img);
      fit(current.attrs);
    };
    const showMissing = () => {
      dom.classList.add('text-document-picture-missing');
      clip.textContent = PICTURE_MISSING_TEXT;
    };
    const load = (key: string) => {
      giveBack();
      clip.replaceChildren();
      delete dom.dataset.ownWidth;
      delete dom.dataset.ownHeight;
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
      dom.dataset.media = key;
      if (key !== shown?.key) load(key);
      fit(picture.attrs);
    };

    // A handle dragged: the box follows the pointer (in points, by how large the box is drawn), written on release.
    const startDrag = (down: PointerEvent, handle: PictureHandle) => {
      if (!sizing || down.button !== 0 || endDrag) return;
      down.preventDefault();
      down.stopPropagation();
      const box = pictureBox(current.attrs);
      const start = { width: box.width, height: box.height };
      const drawn = dom.getBoundingClientRect().width;
      const pixelsAPoint = drawn > 0 && start.width > 0 ? drawn / start.width : PIXELS_A_POINT;
      const room = sizing.room();
      let size = start;
      const move = (e: PointerEvent) => {
        size = resizedPicture(
          start,
          handle,
          (e.clientX - down.clientX) / pixelsAPoint,
          (e.clientY - down.clientY) / pixelsAPoint,
          { shift: e.shiftKey, room },
        );
        fit({ ...current.attrs, ...size });
      };
      const up = () => endDrag?.(true);
      const cancel = () => endDrag?.(false);
      const key = (e: KeyboardEvent) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        cancel();
      };
      endDrag = (write) => {
        endDrag = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key, true);
        dom.classList.remove('text-document-picture-sizing');
        const pos = getPos();
        const moved = size.width !== start.width || size.height !== start.height;
        if (write && moved && pos !== undefined && !destroyed) sizing.resize(pos, size);
        else fit(current.attrs);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key, true);
      dom.classList.add('text-document-picture-sizing');
    };
    const showHandles = () => {
      if (handles || !sizing?.can()) return;
      handles = document.createElement('span');
      handles.className = 'text-document-picture-handles';
      handles.setAttribute('aria-hidden', 'true');
      for (const which of PICTURE_HANDLES) {
        const handle = document.createElement('span');
        handle.dataset.pictureHandle = which;
        handle.addEventListener('pointerdown', (e) => startDrag(e, which));
        handles.append(handle);
      }
      dom.append(handles);
    };
    const hideHandles = () => {
      endDrag?.(false);
      handles?.remove();
      handles = null;
    };

    draw(node);
    return {
      dom,
      update: (next) => {
        if (next.type !== node.type) return false;
        draw(next);
        return true;
      },
      selectNode: () => {
        dom.classList.add('ProseMirror-selectednode');
        showHandles();
      },
      deselectNode: () => {
        dom.classList.remove('ProseMirror-selectednode');
        hideHandles();
      },
      // The handles are the picture's own: the editor neither selects nor drags from them.
      stopEvent: (event) =>
        event.target instanceof Element && event.target.closest('[data-picture-handle]') !== null,
      ignoreMutation: () => true,
      destroy: () => {
        destroyed = true;
        hideHandles();
        giveBack();
      },
    };
  };
}
