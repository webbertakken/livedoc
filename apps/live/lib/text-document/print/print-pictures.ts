// A text document's print where the browser cannot print a PDF it is handed (docs/specs/034-text-documents/
// files-and-print.md "Printing"; the PDF document's way, 035 files-print-and-sync.md "Printing"): the written PDF's
// pages drawn by the engine at PDF_PRINT_DPI, each a JPEG at its page's size, for the print frame's print-only sheet.
import { PDF_PRINT_DPI, type PdfEngine } from '@livedoc/pdf-documents';
import type { PdfPrintPicture } from '@/lib/pdf-document/pdf-print';

/** A printed picture's JPEG quality: past what a print shows (as the PDF document's). */
const PRINT_QUALITY = 0.92;
const POINTS_AN_INCH = 72;

/** Pixels as a JPEG, by the browser's own encoder. */
export type RgbaToJpeg = (
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  quality: number,
) => Promise<Uint8Array<ArrayBuffer>>;

export const canvasJpeg: RgbaToJpeg = async (width, height, rgba, quality) => {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Uint8Array(await blob.arrayBuffer());
};

/** Each page of the PDF `bytes` as a picture; null where the engine cannot open or draw it. */
export async function pdfPagesAsPictures(
  bytes: Uint8Array<ArrayBuffer>,
  engine: Pick<PdfEngine, 'open' | 'drawPage' | 'close'>,
  toJpeg: RgbaToJpeg = canvasJpeg,
): Promise<PdfPrintPicture[] | null> {
  try {
    const opened = await engine.open(bytes);
    if (!opened.ok) return null;
    const pictures: PdfPrintPicture[] = [];
    for (const [index, page] of opened.pages.entries()) {
      const drawn = await engine.drawPage(index, PDF_PRINT_DPI / POINTS_AN_INCH);
      if (!drawn) return null;
      pictures.push({
        jpeg: await toJpeg(drawn.width, drawn.height, drawn.rgba, PRINT_QUALITY),
        width: page.width,
        height: page.height,
      });
    }
    return pictures;
  } finally {
    await engine.close().catch(() => undefined);
  }
}
