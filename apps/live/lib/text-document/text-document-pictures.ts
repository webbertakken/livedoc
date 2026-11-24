// Pictures in line in the editor (docs/specs/034-text-documents/objects.md "In the editor"): one atom of its paragraph,
// drawn at its size from its media in the live state's `media` map, its crop cutting the picture drawn larger behind a
// box of that size; read by its alternative text, a decorative one as nothing; a grey box when its media is missing.
// A gallery media is drawn from the gallery image it names (objects.md "Where the bytes live"). A turned picture is
// drawn turned about its centre, its line making room for its bounds; a recoloured or adjusted one through its colour
// filter. Selected, it is sized, cropped and turned by its handles (objects.md "Working with a picture").
import type { Node as PmNode, NodeSpec } from 'prosemirror-model';
import type { Decoration, NodeView, NodeViewConstructor } from 'prosemirror-view';
import type { CroppedPicture } from './text-document-picture-crop';
import { PLACED_PICTURE_CLASS, type PlacedLayout } from './text-document-picture-placed';
import {
  PICTURE_ATTRIBUTES,
  Pictures,
  type PictureCrop,
  type PictureMedia,
} from '@livedoc/text-documents';
import { pictureColourer } from './text-document-picture-colours';
import { PICTURE_HANDLES, type PictureSize } from './text-document-picture-size';
import {
  dragPicture,
  PICTURE_ROTATE_HANDLE,
  type PictureDragHandle,
  type PictureDragResult,
} from './text-document-picture-drag';
import { nullAttributes } from './text-document-attributes';
import {
  DRAWING_CONTROL,
  pictureDrawingLayer,
  type AttachDrawing,
} from './text-document-picture-drawing-layer';

/** What a picture shows when its media is not in the state. */
export const PICTURE_MISSING_TEXT = 'Picture, not loaded';

const length = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100_000 ? value : 0;
const share = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1 ? value : 0;
const round3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/**
 * The box a picture takes, in points, and the picture drawn inside it: larger by its crop, moved by its top and left;
 * its turn, and the bounds its line makes room for, the box centred in them.
 */
export function pictureBox(attrs: Readonly<Record<string, unknown>>): {
  width: number;
  height: number;
  image: { width: number; height: number; left: number; top: number };
  rotation: number;
  bounds: { width: number; height: number };
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
  const rotation = Pictures.rotation(attrs.rotation) ?? 0;
  const bounds = Pictures.turnedBounds({ width, height }, rotation);
  return {
    width,
    height,
    image: { ...image, left: round3(-left * image.width), top: round3(-top * image.height) },
    rotation,
    bounds: { width: round3(bounds.width), height: round3(bounds.height) },
  };
}

const boxStyle = (attrs: Readonly<Record<string, unknown>>) => {
  const { bounds } = pictureBox(attrs);
  return `width: ${bounds.width}pt; height: ${bounds.height}pt`;
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
  // Where a drawing's picture is drawn live, and its bar (objects.md "Drawn"); absent where nothing draws drawings.
  readonly drawing?: AttachDrawing;
};

/**
 * How a selected picture is sized, cropped and turned by its handles (objects.md "Working with a picture"): whether the
 * reader may, the room the text has (points), and the size, crop or turn written on release, at the picture's position
 * then.
 */
export type PictureSizingHooks = {
  readonly can: () => boolean;
  readonly room: () => PictureSize;
  readonly resize: (pos: number, size: PictureSize) => void;
  readonly crop: (pos: number, next: CroppedPicture) => void;
  readonly rotate: (pos: number, rotation: number) => void;
};

/** Told, bubbling from a picture, once its image is drawn and its own pixels noted. */
export const PICTURE_DRAWN_EVENT = 'text-document-picture-drawn';

/**
 * The node view drawing each picture from its media: held bytes as an object URL, a gallery image as its URL, clipped
 * to its box; selected, its eight handles for whoever may size it (`sizing`), crop marks while it is being cropped
 * (the whole picture drawn, what lies beyond its box dimmed). It notes the drawn image's own pixels.
 */
export function pictureView(
  source: PictureSource,
  sizing?: PictureSizingHooks,
): NodeViewConstructor {
  return (node: PmNode, _view, getPos, decorations): NodeView => {
    const dom = document.createElement('span');
    dom.contentEditable = 'false';
    dom.className = 'text-document-picture';
    // The picture's own box, turned about its centre inside the bounds its line makes room for.
    const turn = document.createElement('span');
    turn.className = 'text-document-picture-turn';
    const clip = document.createElement('span');
    clip.className = 'text-document-picture-clip';
    turn.append(clip);
    dom.append(turn);
    const colour = pictureColourer(dom);
    const drawingLayer = pictureDrawingLayer(clip, dom, source.drawing);
    // What is shown, and how to give it back: an object URL is revoked, a gallery URL released.
    let shown: { key: string; url?: string; give?: () => void } | undefined;
    let current = node;
    let destroyed = false;
    let handles: HTMLElement | null = null;
    let cropping = false;
    // While cropping, what lies beyond the box, dimmed: a frame the size of the whole picture, its box cut out of it.
    let shade: HTMLElement | null = null;
    // Ends a drag under way: written, or left as it was.
    let endDrag: ((write: boolean) => void) | null = null;
    const giveBack = () => {
      shown?.give?.();
      shown = undefined;
    };
    // The box and the picture in it at a size and turn: the picture's own, or a drag's. A turn being dragged keeps the
    // bounds it began with, so the line stays still under the pointer until the turn is written.
    let bounds = { width: 0, height: 0 };
    // Placed out of its line (objects.md "In the editor"): its box from its paragraph's top left, its anchor of no width.
    let placed: PlacedLayout | null = null;
    const fit = (attrs: Readonly<Record<string, unknown>>, keepBounds = false) => {
      const box = pictureBox(attrs);
      if (!keepBounds) bounds = box.bounds;
      dom.classList.toggle(PLACED_PICTURE_CLASS, placed !== null);
      if (placed) dom.dataset.placed = placed.layer;
      else delete dom.dataset.placed;
      dom.style.width = placed ? '0px' : `${bounds.width}pt`;
      dom.style.height = placed ? '0px' : `${bounds.height}pt`;
      turn.style.width = `${box.width}pt`;
      turn.style.height = `${box.height}pt`;
      turn.style.left = `${placed ? placed.picture.left : round3((bounds.width - box.width) / 2)}pt`;
      turn.style.top = `${placed ? placed.picture.top : round3((bounds.height - box.height) / 2)}pt`;
      turn.style.transform = box.rotation ? `rotate(${box.rotation}deg)` : '';
      const turnLeft = placed ? placed.picture.left : (bounds.width - box.width) / 2;
      const turnTop = placed ? placed.picture.top : (bounds.height - box.height) / 2;
      drawingLayer.fit({
        image: box.image,
        bounds: {
          left: round3(turnLeft + (box.width - bounds.width) / 2),
          top: round3(turnTop + (box.height - bounds.height) / 2),
          width: bounds.width,
          height: bounds.height,
        },
      });
      dom.dataset.rotation = String(box.rotation);
      const img = clip.querySelector('img');
      if (!img) return;
      img.alt = attrs.decorative === true ? '' : typeof attrs.alt === 'string' ? attrs.alt : '';
      colour(img, attrs);
      img.style.width = `${box.image.width}pt`;
      img.style.height = `${box.image.height}pt`;
      img.style.left = `${box.image.left}pt`;
      img.style.top = `${box.image.top}pt`;
      if (shade) {
        Object.assign(shade.style, {
          left: `${box.image.left}pt`,
          top: `${box.image.top}pt`,
          width: `${box.image.width}pt`,
          height: `${box.image.height}pt`,
        });
        Object.assign((shade.firstElementChild as HTMLElement).style, {
          left: `${-box.image.left}pt`,
          top: `${-box.image.top}pt`,
          width: `${box.width}pt`,
          height: `${box.height}pt`,
        });
      }
    };
    const crop = (on: boolean) => {
      if (on === cropping) return;
      cropping = on;
      endDrag?.(false);
      dom.classList.toggle('text-document-picture-cropping', on);
      shade?.remove();
      shade = null;
      if (on) {
        shade = document.createElement('span');
        shade.className = 'text-document-picture-shade';
        shade.setAttribute('aria-hidden', 'true');
        shade.append(document.createElement('span'));
        turn.insertBefore(shade, handles);
      }
      fit(current.attrs);
    };
    const croppingIn = (marks: readonly Decoration[]) =>
      marks.some((d) => (d.spec as { cropping?: boolean } | undefined)?.cropping === true);
    const placedIn = (marks: readonly Decoration[]): PlacedLayout | null =>
      marks
        .map((d) => (d.spec as { placed?: PlacedLayout } | undefined)?.placed)
        .find((layout) => layout !== undefined) ?? null;
    const showImage = (url: string) => {
      dom.classList.remove('text-document-picture-missing');
      const img = document.createElement('img');
      img.src = url;
      img.draggable = false;
      img.addEventListener('load', () => {
        dom.dataset.ownWidth = String(img.naturalWidth);
        dom.dataset.ownHeight = String(img.naturalHeight);
        dom.dispatchEvent(new Event(PICTURE_DRAWN_EVENT, { bubbles: true }));
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
      drawingLayer.show(
        typeof picture.attrs.drawing === 'string' && picture.attrs.drawing
          ? picture.attrs.drawing
          : null,
      );
      if (key !== shown?.key) load(key);
      fit(picture.attrs);
    };

    // A handle dragged: the picture follows the pointer, and what the drag made is written on release.
    const startDrag = (down: PointerEvent, handle: PictureDragHandle) => {
      if (!sizing || down.button !== 0 || endDrag) return;
      down.preventDefault();
      down.stopPropagation();
      const turning = handle === PICTURE_ROTATE_HANDLE;
      const write = (made: PictureDragResult | null) => {
        endDrag = null;
        dom.classList.remove('text-document-picture-sizing');
        const pos = getPos();
        if (!made || pos === undefined || destroyed) fit(current.attrs);
        else if ('crop' in made) sizing.crop(pos, made.crop);
        else if ('size' in made) sizing.resize(pos, made.size);
        else sizing.rotate(pos, made.rotation);
      };
      endDrag = dragPicture(down, handle, {
        attrs: current.attrs,
        cropping,
        dom,
        room: sizing.room(),
        preview: (attrs) => fit(attrs, turning),
        done: write,
      });
      dom.classList.add('text-document-picture-sizing');
    };
    const showHandles = () => {
      if (handles || !sizing?.can()) return;
      handles = document.createElement('span');
      handles.className = 'text-document-picture-handles';
      handles.setAttribute('aria-hidden', 'true');
      for (const which of [...PICTURE_HANDLES, PICTURE_ROTATE_HANDLE] as const) {
        const handle = document.createElement('span');
        handle.dataset.pictureHandle = which;
        handle.addEventListener('pointerdown', (e) => startDrag(e, which));
        handles.append(handle);
      }
      turn.append(handles);
    };
    const hideHandles = () => {
      endDrag?.(false);
      handles?.remove();
      handles = null;
    };

    placed = placedIn(decorations);
    draw(node);
    crop(croppingIn(decorations));
    return {
      dom,
      update: (next, marks) => {
        if (next.type !== node.type) return false;
        placed = placedIn(marks);
        draw(next);
        crop(croppingIn(marks));
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
      // The handles, a drawing's bar and its Retry are the picture's own: the editor neither selects nor drags from them.
      stopEvent: (event) =>
        event.target instanceof Element &&
        event.target.closest(`[data-picture-handle], [data-picture-bar], ${DRAWING_CONTROL}`) !==
          null,
      ignoreMutation: () => true,
      destroy: () => {
        destroyed = true;
        hideHandles();
        giveBack();
        drawingLayer.destroy();
      },
    };
  };
}
