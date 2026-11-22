// PDF export (docs/specs/013-workspace/folders.md export menu): the rendered canvas as a PDF of one page, or one
// per page, each page one picture. The pixels are packed without loss and the file is written by the repository's
// one PDF writer (docs/specs/035-pdf-documents/files-print-and-sync.md "One writer"), which loads when a PDF is
// asked for and never with the editor.
import type { LaidOutPage, Tab } from '@livedoc/document';
import { PDF_MAX_PAGE_POINTS } from '@livedoc/pdf-documents';
import type { PicturePage, PicturePagesRefusal } from '@livedoc/pdf-documents/pictures';
import { renderedExportScale, renderTabToCanvas, type ImageExportOpts } from './export-tab';

export async function exportTabAsPdf(tab: Tab, opts: ImageExportOpts = {}): Promise<Blob> {
  const canvas = await renderTabToCanvas(tab, opts);
  const { mediaW, mediaH } = singlePageMedia(
    canvas.width,
    canvas.height,
    renderedExportScale(canvas),
  );
  return picturesAsPdf([{ ...pictureOf(canvas), pageWidth: mediaW, pageHeight: mediaH }]);
}

// CSS px to PDF points (96 to 72 per inch): an A4 page is 595 x 842 pt, as printed.
const PT_PER_PX = 0.75;

/** A single-page PDF's page in points: the canvas at its CSS size (pixels / render scale) at
 *  0.75 pt per px, so it prints at the size it shows rather than at the render's 2x; a page past
 *  the most a PDF page measures shrinks uniformly to fit it. The image keeps every pixel either way. */
export function singlePageMedia(
  pixelW: number,
  pixelH: number,
  scale: number,
): { mediaW: number; mediaH: number } {
  const w = (pixelW / scale) * PT_PER_PX;
  const h = (pixelH / scale) * PT_PER_PX;
  const fit = Math.min(1, PDF_MAX_PAGE_POINTS / Math.max(w, h, 1));
  const pt = (n: number) => Math.max(1, Math.round(n * fit * 100) / 100);
  return { mediaW: pt(w), mediaH: pt(h) };
}

/** A Pages tab's pages as one PDF (docs/specs/007-editor/pages-mode.md "Export"):
 *  every page in row order, one PDF page each at its own size and orientation in print points,
 *  each exactly its sheet. */
export async function exportPagesAsPdf(
  tab: Tab,
  pages: readonly LaidOutPage[],
  opts: ImageExportOpts = {},
): Promise<Blob> {
  const out: PicturePage[] = [];
  // A deck often repeats one animated background: paint it once for the whole PDF.
  const motionFrames = opts.motionFrames ?? new Map();
  for (const page of pages) {
    const canvas = await renderTabToCanvas(tab, { ...opts, page, motionFrames });
    out.push({
      ...pictureOf(canvas),
      pageWidth: Math.round(page.rect.width * PT_PER_PX * 100) / 100,
      pageHeight: Math.round(page.rect.height * PT_PER_PX * 100) / 100,
    });
  }
  return picturesAsPdf(out);
}

// The canvas's pixels as RGB, alpha composited onto white: a PDF's /DeviceRGB carries no alpha, and
// see-through regions would otherwise come out black. Raw pixels rather than a JPEG, so nothing is lost.
function pictureOf(canvas: HTMLCanvasElement): Pick<PicturePage, 'width' | 'height' | 'rgb'> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PDF rendering failed: no 2d context');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < imgData.data.length; i += 4, j += 3) {
    const a = imgData.data[i + 3]! / 255;
    rgb[j] = Math.round(imgData.data[i]! * a + 255 * (1 - a));
    rgb[j + 1] = Math.round(imgData.data[i + 1]! * a + 255 * (1 - a));
    rgb[j + 2] = Math.round(imgData.data[i + 2]! * a + 255 * (1 - a));
  }
  return { width: canvas.width, height: canvas.height, rgb };
}

// What the export dialog shows when the pages are no PDF.
const NOT_WRITTEN: Readonly<Record<PicturePagesRefusal, string>> = {
  no_pages: 'There is no page to export.',
  picture_size: 'PDF rendering failed: the picture came out empty.',
  page_size: 'A page is larger than a PDF page can be.',
};

async function picturesAsPdf(pages: readonly PicturePage[]): Promise<Blob> {
  const { writePicturePages } = await import('@livedoc/pdf-documents/pictures');
  const written = await writePicturePages(pages);
  if (!written.ok) throw new Error(NOT_WRITTEN[written.refusal]);
  return new Blob([written.bytes], { type: 'application/pdf' });
}
