// Handing a print to the browser (docs/specs/035-pdf-documents/files-print-and-sync.md "Printing"): the file in a frame
// of its own, out of sight, printed once it has loaded, so the browser's own print path draws it with its own dialog.
// Pictures go in a print-only document of their own, written with the DOM, each page one picture on a sheet of its
// own size. The frame and what it was handed go once the print dialog closes, or after PDF_PRINT_FRAME_MS where the
// browser never says.
import { PDF_PRINT_FRAME_MS } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { PdfPrintPicture } from './pdf-print';

/** What is printed: a PDF's bytes, or pages as pictures. */
export type PdfPrintContent =
  | { readonly way: 'pdf'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly way: 'pictures'; readonly pictures: readonly PdfPrintPicture[] };

// Out of sight, yet laid out: a frame not drawn never loads a PDF in some browsers.
const HIDDEN =
  'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';

/** The print-only document's style: each picture a sheet of its page's size, nothing else on it. */
export function picturesStyle(sizes: readonly { width: number; height: number }[]): string {
  const pages = sizes
    .map(
      ({ width, height }, at) =>
        `@page p${at}{size:${width}pt ${height}pt;margin:0}.p${at}{page:p${at};width:${width}pt;height:${height}pt}`,
    )
    .join('');
  return `html,body{margin:0}img{display:block;break-after:page}${pages}`;
}

// The pictures written into the frame's own empty document with the DOM, no markup parsed (trusted-types.md); ready
// once every picture is decoded.
async function writePictures(
  frame: HTMLIFrameElement,
  urls: readonly string[],
  sizes: readonly PdfPrintPicture[],
) {
  const sheet = frame.contentDocument!;
  const style = sheet.createElement('style');
  style.textContent = picturesStyle(sizes);
  sheet.head.append(style);
  const images = urls.map((url, at) => {
    const image = sheet.createElement('img');
    image.className = `p${at}`;
    image.alt = '';
    image.src = url;
    return image;
  });
  sheet.body.append(...images);
  await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
}

/** Prints `content` from a frame added to `host`; resolves once the frame is gone. */
export function printInFrame(
  content: PdfPrintContent,
  host: HTMLElement = document.body,
): Promise<void> {
  const urls =
    content.way === 'pdf'
      ? [URL.createObjectURL(new Blob([content.bytes], { type: 'application/pdf' }))]
      : content.pictures.map(({ jpeg }) =>
          URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' })),
        );
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = HIDDEN;
  frame.dataset.pdfPrintFrame = content.way;
  return new Promise((done) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const gone = () => {
      clearTimeout(timer);
      frame.remove();
      for (const url of urls) URL.revokeObjectURL(url);
      done();
    };
    const print = () => {
      const view = frame.contentWindow;
      view?.addEventListener('afterprint', gone, { once: true });
      timer = setTimeout(gone, PDF_PRINT_FRAME_MS);
      try {
        view?.focus();
        view?.print();
      } catch (error) {
        debugLog('[pdf] print-failed step=frame', String(error));
        gone();
      }
    };
    if (content.way === 'pdf') {
      frame.addEventListener('load', print, { once: true });
      frame.src = urls[0]!;
      host.append(frame);
      return;
    }
    host.append(frame);
    void writePictures(frame, urls, content.pictures).then(print);
  });
}
