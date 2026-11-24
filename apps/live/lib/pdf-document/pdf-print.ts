// What File > Print hands the browser (docs/specs/035-pdf-documents/files-print-and-sync.md "Printing"): the bake, or
// the stored file as it arrived, cut to the pages chosen; or, where the browser cannot print a PDF it is handed, the
// chosen pages drawn at PDF_PRINT_DPI with the live marks over them. Always light paper: nothing of Dark pages, of a
// selection or of anyone's presence. The browser's canvas encodes the pictures, so that half is proven in a browser.
import type * as Y from 'yjs';
import { PDF_PRINT_DPI, type Mark, type PageInfo, type PdfEngine } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { bakeForDownload } from './download-pdf';
import type { PdfThumbnailPicture } from './pdf-thumbnail';

/** What a person chose: the pages by index (null for all) and whether the live marks print. */
export type PdfPrintChoice = { readonly pages: readonly number[] | null; readonly marks: boolean };

/** One page drawn for print: its picture as a JPEG and the page's size in points. */
export type PdfPrintPicture = {
  readonly jpeg: Uint8Array<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
};

export type PdfPrintMade =
  | { readonly ok: true; readonly way: 'pdf'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly ok: true; readonly way: 'pictures'; readonly pictures: readonly PdfPrintPicture[] }
  | { readonly ok: false; readonly step: 'bake' | 'cut' | 'draw' };

// A printed picture's JPEG quality: past what a print shows.
const PRINT_QUALITY = 0.92;
const POINTS_AN_INCH = 72;

export type PdfPrintDeps = {
  engine: Pick<PdfEngine, 'bake' | 'cutPages' | 'drawPage'>;
  doc: Y.Doc | null;
  documentName: string;
  readStored: () => Promise<Uint8Array<ArrayBuffer>>;
  pages: readonly PageInfo[];
  /** Draw the pages as pictures: the browser cannot print a PDF, or the file allows only a rough print. */
  pictures: boolean;
  /** The live marks on a page. */
  marksOn: (page: PageInfo) => readonly Mark[];
  /** A page and its marks as a JPEG (pdf-thumbnail-canvas.ts). */
  encode: (
    picture: PdfThumbnailPicture,
    quality: number,
  ) => Promise<Uint8Array<ArrayBuffer> | null>;
};

export async function makePrint(choice: PdfPrintChoice, deps: PdfPrintDeps): Promise<PdfPrintMade> {
  const chosen = choice.pages ?? deps.pages.map((_, index) => index);
  const made = deps.pictures
    ? await drawn(chosen, choice, deps)
    : await filed(chosen, choice, deps);
  debugLog(
    made.ok
      ? `[pdf] printed pages=${chosen.length} marks=${choice.marks ? 'yes' : 'no'} way=${made.way}`
      : `[pdf] print-failed step=${made.step}`,
  );
  return made;
}

async function filed(
  chosen: readonly number[],
  choice: PdfPrintChoice,
  deps: PdfPrintDeps,
): Promise<PdfPrintMade> {
  const baked = await bakeForDownload({
    engine: deps.engine,
    // Document only: the stored file as it arrived, whatever was changed since.
    doc: choice.marks ? deps.doc : null,
    documentName: deps.documentName,
    readStored: deps.readStored,
  });
  if (!baked.ok) return { ok: false, step: 'bake' };
  if (choice.pages === null) return { ok: true, way: 'pdf', bytes: baked.bytes };
  const cut = await deps.engine.cutPages(baked.bytes, chosen);
  return cut ? { ok: true, way: 'pdf', bytes: cut } : { ok: false, step: 'cut' };
}

async function drawn(
  chosen: readonly number[],
  choice: PdfPrintChoice,
  deps: PdfPrintDeps,
): Promise<PdfPrintMade> {
  const pictures: PdfPrintPicture[] = [];
  for (const index of chosen) {
    const page = deps.pages[index]!;
    const bitmap = await deps.engine.drawPage(index, PDF_PRINT_DPI / POINTS_AN_INCH);
    const jpeg = bitmap
      ? await deps.encode(
          { bitmap, marks: choice.marks ? deps.marksOn(page) : [], page },
          PRINT_QUALITY,
        )
      : null;
    if (!jpeg) return { ok: false, step: 'draw' };
    pictures.push({ jpeg, width: page.width, height: page.height });
  }
  return { ok: true, way: 'pictures', pictures };
}
