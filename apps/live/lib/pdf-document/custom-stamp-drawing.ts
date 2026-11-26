// The browser's drawing for a custom stamp's picture (docs/specs/035-pdf-documents/custom-stamps.md "Making one"): a
// PNG, a JPEG or an SVG read as a picture by the browser (an SVG drawn by an <img>, so none of its scripts run and
// nothing it would load is fetched), drawn on a canvas and encoded; a PDF's page drawn by an engine of its own, closed
// once drawn. What is decided about the picture is custom-stamp-picture.ts's.
import type { PdfEngine } from '@livedoc/pdf-documents';
import type { DrawnPicture, PictureDrawing } from './custom-stamp-picture';

/** What the browser holds of a picture to draw it again: an image it decoded, or a page's pixels. */
type Held = CanvasImageSource;

const MIME = { png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml' } as const;

/** (default) A JPEG's quality as kept. */
const JPEG_QUALITY = 0.9;

/** An SVG as a picture: an <img> of its bytes, so the browser draws it as a picture and runs none of it. */
async function svgImage(bytes: Uint8Array<ArrayBuffer>): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME.svg }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function read(
  bytes: Uint8Array<ArrayBuffer>,
  source: 'png' | 'jpeg' | 'svg',
): Promise<(DrawnPicture & { held: Held }) | null> {
  if (source === 'svg') {
    const image = await svgImage(bytes);
    return image ? { width: image.naturalWidth, height: image.naturalHeight, held: image } : null;
  }
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: MIME[source] }));
    return { width: bitmap.width, height: bitmap.height, held: bitmap };
  } catch {
    return null;
  }
}

async function encode(
  held: Held,
  { width, height }: DrawnPicture,
  type: 'png' | 'jpeg',
): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  // A JPEG has no see-through: it is drawn on white, as paper.
  if (type === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(held, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, MIME[type], JPEG_QUALITY),
  );
  if (!blob) throw new Error('the picture could not be encoded');
  return new Uint8Array(await blob.arrayBuffer());
}

/** The browser's drawing, a PDF's page drawn by an engine `start` gives, closed once drawn. */
export function browserPictureDrawing(
  start: () => Pick<PdfEngine, 'open' | 'drawPage' | 'close'>,
): PictureDrawing<Held> {
  return {
    read,
    encode,
    page: async (bytes, index, scale) => {
      const engine = start();
      try {
        const opened = await engine.open(bytes);
        const info = opened.ok ? opened.pages[index] : undefined;
        const drawn = info ? await engine.drawPage(index, scale) : null;
        if (!info || !drawn) return null;
        const canvas = document.createElement('canvas');
        canvas.width = drawn.width;
        canvas.height = drawn.height;
        canvas.getContext('2d')!.putImageData(new ImageData(drawn.rgba, drawn.width), 0, 0);
        return {
          width: drawn.width,
          height: drawn.height,
          points: { width: drawn.width / scale, height: drawn.height / scale },
          held: canvas,
        };
      } catch {
        return null;
      } finally {
        await engine.close();
      }
    },
  };
}
