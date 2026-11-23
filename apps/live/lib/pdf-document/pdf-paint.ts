// Puts a picture the engine drew on a canvas (docs/specs/035-pdf-documents/reading-surface.md "The pages"): pixels
// only, never markup from the file.
import type { PageBitmap } from '@livedoc/pdf-documents';

/** How long a page waits after its size last changed before it, and its tiles, are drawn again, so a zoom or a
 *  resize under way redraws once. Safe range: 80 to 400 ms. */
export const REDRAW_SETTLE_MS = 150;

export function paintPicture(canvas: HTMLCanvasElement, bitmap: PageBitmap): void {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas
    .getContext('2d')
    ?.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
}
