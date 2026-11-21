// Which page the engine draws next (docs/specs/035-pdf-documents/reading-surface.md "The pages"): one draw at a time,
// the page asked for last first, so the page a person has just scrolled to never waits behind pages they passed. A
// page that left view before its turn is never drawn.
import {
  PDF_PAGE_PICTURE_MAX_PIXELS,
  type PageBitmap,
  type PageInfo,
  type PdfEngine,
} from '@livedoc/pdf-documents';

type Waiting = { index: number; scale: number; settle: (bitmap: PageBitmap | null) => void };

export type PdfPageDrawer = {
  /** The page drawn at `scale` (1 is 72 dpi); null when it cannot be drawn or was given up before its turn. */
  draw: (index: number, scale: number) => Promise<PageBitmap | null>;
  /** Gives up a page still waiting its turn. */
  forget: (index: number) => void;
};

/**
 * The scale a page's whole-page picture is drawn at: what the screen asks (`cssScale` × the device's pixel ratio), cut
 * so the picture stays within PDF_PAGE_PICTURE_MAX_PIXELS.
 */
export function pictureScale(page: PageInfo, cssScale: number, pixelRatio: number): number {
  const wanted = cssScale * pixelRatio;
  const pixels = page.width * page.height * wanted * wanted;
  return pixels <= PDF_PAGE_PICTURE_MAX_PIXELS
    ? wanted
    : wanted * Math.sqrt(PDF_PAGE_PICTURE_MAX_PIXELS / pixels);
}

export function pdfPageDrawer(engine: Pick<PdfEngine, 'drawPage'>): PdfPageDrawer {
  const waiting: Waiting[] = [];
  let drawing = false;

  const next = async (): Promise<void> => {
    if (drawing) return;
    const turn = waiting.pop();
    if (!turn) return;
    drawing = true;
    const bitmap = await engine.drawPage(turn.index, turn.scale);
    drawing = false;
    turn.settle(bitmap);
    void next();
  };

  const forget = (index: number) => {
    for (let at = waiting.length - 1; at >= 0; at -= 1) {
      if (waiting[at]!.index !== index) continue;
      waiting[at]!.settle(null);
      waiting.splice(at, 1);
    }
  };

  return {
    draw: (index, scale) =>
      new Promise((settle) => {
        // A page asked for again takes its earlier ask's place.
        forget(index);
        waiting.push({ index, scale, settle });
        void next();
      }),
    forget,
  };
}
