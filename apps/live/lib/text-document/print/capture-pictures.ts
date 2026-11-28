// The pictures of a text document's pages drawn for its PDF (docs/specs/034-text-documents/files-and-print.md
// "Downloading", PDF): each noted picture (capture-pages.ts) as PNG or JPEG bytes covering its box. A plain image is
// its own file where that is PNG or JPEG; a picture of the editor's (objects.md "In the editor": turned, cropped,
// recoloured, drawn on) is drawn as shown, at `CAPTURE_PICTURE_SCALE` times its size; a drawing (SVG) and a canvas
// likewise. Its bytes are read afresh, so a picture from elsewhere never taints the drawing. A picture that cannot be
// read is left out and counted.
import type { LaidOutItem, LaidOutPicture } from '@livedoc/pdf-documents/laid-out';
import type { CapturedPage, NotedPicture } from './capture-pages';
import { rotationOf } from './capture-style';

/** How many pixels a CSS pixel of a drawn picture gets (default). */
export const CAPTURE_PICTURE_SCALE = 2;
/** The most pixels a drawn picture takes on a side, whatever its size (default: a browser's canvas limit is 16384). */
export const CAPTURE_PICTURE_MAX_PX = 8192;

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const starts = (bytes: Uint8Array, magic: readonly number[]) =>
  magic.every((byte, at) => bytes[at] === byte);

/** A file's bytes as the writer takes them: PNG or JPEG by its first bytes, else none. */
export function pictureFormat(bytes: Uint8Array): LaidOutPicture['format'] | null {
  if (starts(bytes, PNG)) return 'png';
  if (starts(bytes, JPEG)) return 'jpeg';
  return null;
}

/** What drawing a picture needs of the browser, injectable for tests. */
export type PictureDrawing = {
  readonly read: (url: string) => Promise<Uint8Array>;
  readonly bitmap: (bytes: Uint8Array) => Promise<ImageBitmap>;
  readonly canvas: (width: number, height: number) => OffscreenCanvas;
};

export const browserPictureDrawing: PictureDrawing = {
  read: async (url) => {
    const answer = await fetch(url);
    if (!answer.ok) throw new Error(`the picture did not load: ${answer.status}`);
    return new Uint8Array(await answer.arrayBuffer());
  },
  bitmap: (bytes) => createImageBitmap(new Blob([bytes.slice()])),
  canvas: (width, height) => new OffscreenCanvas(width, height),
};

/** An SVG as a picture of its own: a copy with every element's drawn style written in. */
export function standaloneSvg(svg: SVGElement): string {
  const copy = svg.cloneNode(true) as SVGElement;
  const from = [svg, ...svg.querySelectorAll('*')];
  const to = [copy, ...copy.querySelectorAll('*')];
  const keep = [
    'fill',
    'fill-opacity',
    'stroke',
    'stroke-width',
    'stroke-opacity',
    'stroke-dasharray',
    'opacity',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'color',
  ];
  from.forEach((element, at) => {
    const style = getComputedStyle(element);
    const written = keep.map((name) => `${name}:${style.getPropertyValue(name)}`).join(';');
    to[at]!.setAttribute('style', `${to[at]!.getAttribute('style') ?? ''};${written}`);
  });
  const box = svg.getBoundingClientRect();
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!copy.getAttribute('width')) copy.setAttribute('width', String(box.width));
  if (!copy.getAttribute('height')) copy.setAttribute('height', String(box.height));
  return new XMLSerializer().serializeToString(copy);
}

const pngOf = async (canvas: OffscreenCanvas) =>
  new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());

/** The pixel scale a picture is drawn at: `CAPTURE_PICTURE_SCALE`, less where that passes the most a side takes. */
const scaleFor = (width: number, height: number) =>
  Math.min(CAPTURE_PICTURE_SCALE, CAPTURE_PICTURE_MAX_PX / Math.max(width, height, 1));

/** An SVG's bitmap at its size. */
async function svgBitmap(svg: SVGElement, drawing: PictureDrawing): Promise<ImageBitmap> {
  return drawing.bitmap(new TextEncoder().encode(standaloneSvg(svg)));
}

/**
 * A picture of the editor's drawn as shown: its box turned about its middle, the image inside it at its own offset
 * and size, recoloured by its filter, cut to its clip, with what is drawn on it over it.
 */
async function drawnPicture(turn: HTMLElement, drawing: PictureDrawing): Promise<Uint8Array> {
  const outer = turn.getBoundingClientRect();
  // CSS pixels per viewport pixel: the zoom undone.
  const css = turn.offsetWidth > 0 ? turn.offsetWidth / Math.max(1, outer.width) : 1;
  const angle = rotationOf(getComputedStyle(turn).transform);
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const w = turn.offsetWidth;
  const h = turn.offsetHeight;
  const boundsW = w * cos + h * sin;
  const boundsH = w * sin + h * cos;
  const scale = scaleFor(boundsW, boundsH);
  const canvas = drawing.canvas(
    Math.max(1, Math.ceil(boundsW * scale)),
    Math.max(1, Math.ceil(boundsH * scale)),
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.scale(scale, scale);
  context.translate(boundsW / 2, boundsH / 2);
  context.rotate(angle);
  context.translate(-w / 2, -h / 2);
  const clip = turn.querySelector<HTMLElement>('.text-document-picture-clip') ?? turn;
  const clipLeft = clip === turn ? 0 : clip.offsetLeft;
  const clipTop = clip === turn ? 0 : clip.offsetTop;
  context.beginPath();
  context.rect(clipLeft, clipTop, clip.offsetWidth, clip.offsetHeight);
  context.clip();
  for (const child of clip.children) {
    if (child instanceof HTMLImageElement) {
      const left = clipLeft + child.offsetLeft;
      const top = clipTop + child.offsetTop;
      const bitmap = await drawing.bitmap(await drawing.read(child.currentSrc || child.src));
      context.filter = getComputedStyle(child).filter || 'none';
      context.drawImage(bitmap, left, top, child.offsetWidth, child.offsetHeight);
      context.filter = 'none';
    } else if (child instanceof SVGElement) {
      // An SVG has no offsets: its place and size are its style's, unturned.
      const style = getComputedStyle(child);
      const box = child.getBoundingClientRect();
      const bitmap = await svgBitmap(child, drawing);
      context.drawImage(
        bitmap,
        clipLeft + (parseFloat(style.left) || 0),
        clipTop + (parseFloat(style.top) || 0),
        parseFloat(style.width) || box.width * css,
        parseFloat(style.height) || box.height * css,
      );
    } else if (child instanceof HTMLCanvasElement) {
      context.drawImage(
        child,
        clipLeft + child.offsetLeft,
        clipTop + child.offsetTop,
        child.offsetWidth,
        child.offsetHeight,
      );
    }
  }
  return pngOf(canvas);
}

/** A noted picture's bytes and format. */
async function pictureBytes(
  element: Element,
  drawing: PictureDrawing,
): Promise<{ bytes: Uint8Array; format: LaidOutPicture['format'] }> {
  if (element instanceof HTMLImageElement) {
    const bytes = await drawing.read(element.currentSrc || element.src);
    const format = pictureFormat(bytes);
    if (format && (getComputedStyle(element).filter || 'none') === 'none') return { bytes, format };
    const bitmap = await drawing.bitmap(bytes);
    const scale = scaleFor(element.offsetWidth, element.offsetHeight);
    const canvas = drawing.canvas(
      Math.max(1, Math.ceil(element.offsetWidth * scale)),
      Math.max(1, Math.ceil(element.offsetHeight * scale)),
    );
    const context = canvas.getContext('2d')!;
    context.filter = getComputedStyle(element).filter || 'none';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { bytes: await pngOf(canvas), format: 'png' };
  }
  if (element instanceof SVGElement) {
    const box = element.getBoundingClientRect();
    const scale = scaleFor(box.width, box.height);
    const bitmap = await svgBitmap(element, drawing);
    const canvas = drawing.canvas(
      Math.max(1, Math.ceil(box.width * scale)),
      Math.max(1, Math.ceil(box.height * scale)),
    );
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { bytes: await pngOf(canvas), format: 'png' };
  }
  if (element instanceof HTMLCanvasElement) {
    const blob = await new Promise<Blob | null>((done) => element.toBlob(done, 'image/png'));
    if (!blob) throw new Error('the canvas gave no picture');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), format: 'png' };
  }
  return { bytes: await drawnPicture(element as HTMLElement, drawing), format: 'png' };
}

/**
 * Draws every noted picture into its item; a picture that cannot be read is taken off its page and counted. Answers
 * how many were left out.
 */
export async function drawPictures(
  pages: readonly CapturedPage[],
  pictures: readonly NotedPicture[],
  drawing: PictureDrawing = browserPictureDrawing,
): Promise<number> {
  const failed = new Set<LaidOutItem>();
  await Promise.all(
    pictures.map(async ({ page, index, element }) => {
      const item = pages[page]!.items[index]!;
      if (item.kind !== 'picture') return;
      try {
        const { bytes, format } = await pictureBytes(element, drawing);
        pages[page]!.items[index] = { ...item, bytes, format };
      } catch {
        failed.add(item);
      }
    }),
  );
  for (const page of pages) {
    for (let at = page.items.length - 1; at >= 0; at -= 1) {
      if (!failed.has(page.items[at]!)) continue;
      page.items.splice(at, 1);
      page.sources.splice(at, 1);
    }
  }
  return failed.size;
}
