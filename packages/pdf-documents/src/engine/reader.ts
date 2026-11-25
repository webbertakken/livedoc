// Reading and drawing a PDF with PDFium in WebAssembly (docs/specs/035-pdf-documents/opening.md "What is read",
// security.md "The boundary"). With the files it calls, the only code that drives the reader's C interface;
// everything it answers is typed and bounded on the way out. No script runtime is built into the engine, so no
// script of a file can run.
import { init } from '@embedpdf/pdfium';
import type {
  EmbeddedFileRead,
  FileMark,
  Outline,
  PageBitmap,
  PageLook,
  PageMatrix,
  PageTurns,
  TileRect,
  PageLink,
  PagePoint,
  PdfOpened,
  PdfRefusal,
  TextSelection,
} from '../engine-contract';
import type { EmbeddedFiles } from '../embedded-file';
import type { PageField } from '../file-field';
import type { PageTags } from '../page-tags';
import type { PageText } from '../page-text';
import { darkened, pagePlace } from './dark-step';
import { drawPage, drawTile, pageMatrix } from './draw-page';
import { readDocument, readPages } from './read-document';
import { readEmbeddedFile, readEmbeddedFiles } from './read-embedded-files';
import { readFields } from './read-fields';
import { readMarks } from './read-marks';
import { readLinks, readOutline } from './read-outline';
import { readSignatures, type SignatureHeld } from './read-signatures';
import { readPageTags, type TagLimits } from './read-tags';
import { readPageText, selectText } from './read-text';
import { ReaderFile, type Clamped, type DarkStep, type Pdfium } from './reader-file';

export type { Pdfium } from './reader-file';

// FPDF_GetLastError's answers.
const ERROR_PASSWORD = 4;
const ERROR_SECURITY = 5;
// A file encrypted to certificates names this handler (opening.md "Refusals").
const CERTIFICATE_HANDLER = new TextEncoder().encode('/Adobe.PubSec');

/** The reader, started once from its WebAssembly binary. */
export async function startReader(wasm: ArrayBuffer | Uint8Array): Promise<Pdfium> {
  const pdfium = await init({ wasmBinary: wasm as ArrayBuffer });
  pdfium.PDFiumExt_Init();
  return pdfium;
}

function holds(bytes: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let at = bytes.length - needle.length; at >= 0; at -= 1) {
    for (let n = 0; n < needle.length; n += 1) if (bytes[at + n] !== needle[n]) continue outer;
    return true;
  }
  return false;
}

function refusalOf(error: number, bytes: Uint8Array): PdfRefusal {
  if (error !== ERROR_SECURITY) return 'pdf_damaged';
  return holds(bytes, CERTIFICATE_HANDLER) ? 'pdf_certificate_protected' : 'pdf_rights_protected';
}

/** One open PDF: everything the engine reads of it. Each part is read by its own file beside this one. */
export class PdfReader {
  private readonly file: ReaderFile;

  constructor(pdfium: Pdfium) {
    this.file = new ReaderFile(pdfium);
  }

  /** Opens the bytes, with the password given; none is the empty one, which opens a file that asks for none. */
  open(bytes: Uint8Array, password = ''): PdfOpened {
    const { file } = this;
    try {
      if (!file.load(bytes, password)) {
        const error = file.p.FPDF_GetLastError();
        file.close();
        if (error === ERROR_PASSWORD) return { ok: false, needsPassword: true };
        return { ok: false, refusal: refusalOf(error, bytes) };
      }
      file.count = file.p.FPDF_GetPageCount(file.doc);
      if (file.count <= 0) {
        file.close();
        return { ok: false, refusal: 'pdf_newer' };
      }
      return { ok: true, pages: readPages(file), document: readDocument(file) };
    } catch {
      // A trap inside the reader: it is ended here, and a fresh one serves the next file.
      file.forget();
      return { ok: false, refusal: 'pdf_stopped' };
    }
  }

  /** The file's own marks its pages are drawn without from now on, by id; none again once another file opens. */
  hideMarks(ids: readonly string[]): void {
    this.file.marksHidden = new Set(ids);
  }

  drawPage(
    index: number,
    scale: number,
    ceiling?: number,
    turns: PageTurns = 0,
    look: PageLook = 'paper',
  ): PageBitmap | null {
    const { file } = this;
    const drawn = drawPage(file, index, scale, ceiling, turns);
    if (!drawn || look === 'paper') return drawn;
    return darkened(file, index, drawn, pagePlace(file, index, turns, drawn.width));
  }

  drawTile(
    index: number,
    scale: number,
    turns: PageTurns,
    rect: TileRect,
    look: PageLook = 'paper',
  ): PageBitmap | null {
    const { file } = this;
    const drawn = drawTile(file, index, scale, turns, rect);
    if (!drawn || look === 'paper') return drawn;
    const place = {
      factor: scale,
      x: Math.max(0, Math.floor(rect.x)),
      y: Math.max(0, Math.floor(rect.y)),
    };
    return darkened(file, index, drawn, place);
  }

  /** What the last Dark pages step took, once: the engine logs it. */
  takeDarkStep(): DarkStep | null {
    const step = this.file.darkStep;
    this.file.darkStep = null;
    return step;
  }

  pageMatrix(index: number, turns: PageTurns = 0): PageMatrix | null {
    return pageMatrix(this.file, index, turns);
  }

  outline(most?: number): Outline {
    return readOutline(this.file, most);
  }

  links(index: number, most?: number): readonly PageLink[] {
    return readLinks(this.file, index, most);
  }

  pageText(index: number, most?: number): PageText | null {
    return readPageText(this.file, index, most);
  }

  pageTags(index: number, limits?: TagLimits): PageTags | null {
    return readPageTags(this.file, index, limits);
  }

  selectText(index: number, from: PagePoint, to: PagePoint): TextSelection | null {
    return selectText(this.file, index, from, to);
  }

  fileMarks(index: number, most?: number): readonly FileMark[] {
    return readMarks(this.file, index, most);
  }

  fields(index: number, most?: number): readonly PageField[] {
    return readFields(this.file, index, most);
  }

  signatures(most?: number, mostBytes?: number): SignatureHeld[] {
    return readSignatures(this.file, most, mostBytes);
  }

  embeddedFiles(most?: number): EmbeddedFiles {
    return readEmbeddedFiles(this.file, most);
  }

  embeddedFile(at: number, most?: number): EmbeddedFileRead {
    return readEmbeddedFile(this.file, at, most);
  }

  /** What was held back of the file since this was last asked (security.md "The boundary"). */
  takeClamped(): ReadonlyMap<Clamped, number> {
    return this.file.takeClamped();
  }

  /** The bytes of memory the reader holds: its heap, which grows and never shrinks. */
  heldBytes(): number {
    return this.file.heap.length;
  }

  /** How many pages the open file has; 0 when none is open. */
  pageCount(): number {
    return this.file.count;
  }

  close(): void {
    this.file.close();
  }
}
