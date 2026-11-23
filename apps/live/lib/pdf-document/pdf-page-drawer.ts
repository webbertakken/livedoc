// Which page the engine draws next (docs/specs/035-pdf-documents/reading-surface.md "The pages"): one draw at a time,
// the page asked for last first, so the page a person has just scrolled to never waits behind pages they passed. A
// page that left view before its turn is never drawn.
import {
  PDF_PAGE_PICTURE_MAX_PIXELS,
  type PageBitmap,
  type PageInfo,
  type PageTurns,
  type PdfEngine,
  type TileRect,
} from '@livedoc/pdf-documents';

// One draw waiting its turn, by its name: a page's picture (`page:<index>`) or a tile (its own key).
type Waiting = {
  key: string;
  run: () => Promise<PageBitmap | null>;
  settle: (bitmap: PageBitmap | null) => void;
};

export type PdfPageDrawer = {
  /**
   * The page drawn at `scale` (1 is 72 dpi), turned `turns` quarters clockwise; null when it cannot be drawn or was
   * given up before its turn.
   */
  draw: (index: number, scale: number, turns?: PageTurns) => Promise<PageBitmap | null>;
  /** Gives up a page still waiting its turn. */
  forget: (index: number) => void;
  /** A tile of a page (reading-surface.md "The pages"), in the same line as the pages: the latest asked first. */
  drawTile: (
    key: string,
    index: number,
    scale: number,
    turns: PageTurns,
    rect: TileRect,
  ) => Promise<PageBitmap | null>;
  /** Gives up a tile still waiting its turn. */
  forgetTile: (key: string) => void;
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

export function pdfPageDrawer(engine: Pick<PdfEngine, 'drawPage' | 'drawTile'>): PdfPageDrawer {
  const waiting: Waiting[] = [];
  let drawing = false;

  const next = async (): Promise<void> => {
    if (drawing) return;
    const turn = waiting.pop();
    if (!turn) return;
    drawing = true;
    const bitmap = await turn.run();
    drawing = false;
    turn.settle(bitmap);
    void next();
  };

  const forgetTile = (key: string) => {
    for (let at = waiting.length - 1; at >= 0; at -= 1) {
      if (waiting[at]!.key !== key) continue;
      waiting[at]!.settle(null);
      waiting.splice(at, 1);
    }
  };
  const ask = (key: string, run: Waiting['run']) =>
    new Promise<PageBitmap | null>((settle) => {
      // A draw asked for again takes its earlier ask's place.
      forgetTile(key);
      waiting.push({ key, run, settle });
      void next();
    });
  const pageKey = (index: number) => `page:${index}`;

  return {
    draw: (index, scale, turns = 0) =>
      ask(pageKey(index), () => engine.drawPage(index, scale, turns)),
    forget: (index) => forgetTile(pageKey(index)),
    drawTile: (key, index, scale, turns, rect) =>
      ask(key, () => engine.drawTile(index, scale, turns, rect)),
    forgetTile,
  };
}
