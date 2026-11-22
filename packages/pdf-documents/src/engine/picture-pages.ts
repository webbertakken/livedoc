// Pages that are each one picture, written as a PDF (docs/specs/035-pdf-documents/files-print-and-sync.md "One
// writer"): how every other kind's Download as PDF is written, by the repository's one PDF writer. It parses nothing
// of anyone's: what it is handed is LiveDoc's own pixels. Loaded where a PDF is asked for, never before.
import { PDF, PDFImage, PdfName, PdfNumber, PdfStream } from '@libpdf/core';
import { PDF_MAX_PAGE_POINTS } from '../limits';

/** One page that is one picture, drawn across the whole of it. */
export type PicturePage = {
  /** The picture's size in pixels. */
  readonly width: number;
  readonly height: number;
  /** Its pixels: red, green and blue, a byte each, row by row from the top. No pixel is see-through. */
  readonly rgb: Uint8Array;
  /** The page's size in points, each side at most `PDF_MAX_PAGE_POINTS`. */
  readonly pageWidth: number;
  readonly pageHeight: number;
};

/** Why pages of pictures are not a PDF. */
export type PicturePagesRefusal = 'no_pages' | 'picture_size' | 'page_size';

export type PicturePagesWritten =
  | { readonly ok: true; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly refusal: PicturePagesRefusal };

const PRODUCER = 'LiveDoc';

const isCount = (n: number): boolean => Number.isInteger(n) && n > 0;
const isSide = (points: number): boolean => points > 0 && points <= PDF_MAX_PAGE_POINTS;

function refusalOf(pages: readonly PicturePage[]): PicturePagesRefusal | null {
  if (pages.length === 0) return 'no_pages';
  for (const { width, height, rgb, pageWidth, pageHeight } of pages) {
    if (!isCount(width) || !isCount(height) || rgb.length !== width * height * 3)
      return 'picture_size';
    if (!isSide(pageWidth) || !isSide(pageHeight)) return 'page_size';
  }
  return null;
}

/** Bytes packed as a PDF's FlateDecode reads them, by the platform's own packer. */
async function deflated(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const packed = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(packed).arrayBuffer());
}

/**
 * The pages as one PDF, in the order given; `at` is when it is made, said in the file. A picture's pixels are packed
 * without loss and never re-encoded.
 */
export async function writePicturePages(
  pages: readonly PicturePage[],
  at: Date = new Date(),
): Promise<PicturePagesWritten> {
  const refusal = refusalOf(pages);
  if (refusal) return { ok: false, refusal };
  const pdf = PDF.create();
  pdf.setProducer(PRODUCER);
  pdf.setCreator(PRODUCER);
  pdf.setCreationDate(at);
  pdf.setModificationDate(at);
  for (const { width, height, rgb, pageWidth, pageHeight } of pages) {
    const picture = PdfStream.fromDict(
      {
        Type: PdfName.of('XObject'),
        Subtype: PdfName.of('Image'),
        Width: PdfNumber.of(width),
        Height: PdfNumber.of(height),
        ColorSpace: PdfName.of('DeviceRGB'),
        BitsPerComponent: PdfNumber.of(8),
        Filter: PdfName.of('FlateDecode'),
      },
      await deflated(rgb),
    );
    const page = pdf.addPage({ width: pageWidth, height: pageHeight });
    page.drawImage(new PDFImage(pdf.register(picture), width, height), {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }
  return { ok: true, bytes: (await pdf.save()) as Uint8Array<ArrayBuffer> };
}
