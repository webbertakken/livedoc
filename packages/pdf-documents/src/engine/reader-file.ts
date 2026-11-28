// One PDF open in the reader's own memory (docs/specs/035-pdf-documents/security.md "The boundary"): the bytes are
// copied in, and everything read of the file is read through here. The read-*.ts files beside it each read one part
// of the file, typed and bounded on the way out.
import type { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { PDF_MAX_COORDINATE, PDF_MAX_PAGE_POINTS } from '../limits';

export type Pdfium = WrappedPdfiumModule;

// The part of the reader's runtime the engine uses, typed here: the package types it by globals a consumer lacks.
type Runtime = {
  readonly HEAPU8: Uint8Array;
  readonly wasmExports: { malloc(size: number): number; free(pointer: number): void };
  getValue(pointer: number, type: 'float' | 'double' | 'i32'): number;
  UTF16ToString(pointer: number): string;
};

/** FPDF_GetFormType's answers; every other is an XFA form. */
export const FORM_NONE = 0;
export const FORM_FIELDS = 1;
const BYTES = new TextDecoder();

/** A coordinate read from a file, held within reach of the page; one that is no number is the origin. */
const heldCoordinate = (n: number): number =>
  Number.isFinite(n) ? Math.min(Math.max(n, -PDF_MAX_COORDINATE), PDF_MAX_COORDINATE) : 0;

/** A page's side in points, held within what a PDF page may measure. */
export const clampSide = (points: number): number =>
  Number.isFinite(points) ? Math.min(Math.max(points, 1), PDF_MAX_PAGE_POINTS) : 1;

/**
 * What of a file was held back on its way out (security.md "The boundary"): a coordinate out of reach, a page's
 * size out of bounds, a text cut to its limit, a list cut to its limit.
 */
/** A box of a page, in its own points (PDF user space). */
export type PageBox = { left: number; bottom: number; right: number; top: number };

/** One Dark pages step: how long it took, the photographs it put back, or that it failed. */
export type DarkStep = { ms: number; pictures: number } | { failed: true };

export type Clamped = 'coordinate' | 'size' | 'text' | 'list' | 'picture';

export class ReaderFile {
  readonly p: Pdfium;
  /** The open file's handle; 0 when none is open. */
  doc = 0;
  /** How many pages the open file has; 0 when none is open. */
  count = 0;
  private memory = 0;
  // The form's environment, started when a page's fields are first read: field values are read through it.
  private form = 0;
  private formInfo = 0;
  // How many values of each sort were held back since the tally was last taken.
  private tally = new Map<Clamped, number>();
  /** Dark pages: each page's photographs, by index, judged once while the file is open (dark-step.ts). */
  readonly photographs = new Map<number, readonly PageBox[]>();
  /** Dark pages: what the last step took, for the engine to log; taken once. */
  darkStep: DarkStep | null = null;
  /** The file's own marks its pages are drawn without, by id (marks.md "Changing a mark"). */
  marksHidden: ReadonlySet<string> = new Set();

  constructor(pdfium: Pdfium) {
    this.p = pdfium;
  }

  get runtime(): Runtime {
    return this.p.pdfium;
  }

  get heap(): Uint8Array {
    return this.runtime.HEAPU8;
  }

  alloc(size: number): number {
    return this.runtime.wasmExports.malloc(size);
  }

  free(pointer: number): void {
    this.runtime.wasmExports.free(pointer);
  }

  /** Copies the bytes in and opens them with the password; false where the reader does not open them. */
  load(bytes: Uint8Array, password: string): boolean {
    this.close();
    this.memory = this.alloc(bytes.length);
    this.heap.set(bytes, this.memory);
    this.doc = this.p.FPDF_LoadMemDocument(this.memory, bytes.length, password);
    return this.doc !== 0;
  }

  /** Counts a value held back: it is logged, never passed on as the file wrote it. */
  clamped(what: Clamped): void {
    this.tally.set(what, (this.tally.get(what) ?? 0) + 1);
  }

  /** What was held back since this was last asked, and counts it no more. */
  takeClamped(): ReadonlyMap<Clamped, number> {
    const taken = this.tally;
    this.tally = new Map();
    return taken;
  }

  /** `length` bytes of the reader's memory at `at`, each a character: a name the file writes, as a filter's. */
  latin1(at: number, length: number): string {
    return String.fromCharCode(...this.heap.subarray(at, at + length));
  }

  /** A coordinate read from the file, held within reach of the page. */
  held(n: number): number {
    const within = heldCoordinate(n);
    if (within !== n) this.clamped('coordinate');
    return within;
  }

  /** A page's side as the file says it, held within what a PDF page may measure. */
  side(points: number): number {
    const within = clampSide(points);
    if (within !== points) this.clamped('size');
    return within;
  }

  /** A text of the file, cut to `most` characters. */
  private cut(text: string, most: number): string {
    if (text.length <= most) return text;
    this.clamped('text');
    return text.slice(0, most);
  }

  /** A text the reader writes as UTF-16 into a buffer it is handed, cut to `most`; `ask` answers the bytes needed. */
  written(most: number, ask: (buffer: number, size: number) => number): string {
    const size = ask(0, 0);
    // Two bytes is the terminator alone: no text.
    if (size <= 2) return '';
    const buffer = this.alloc(size);
    ask(buffer, size);
    const read = this.runtime.UTF16ToString(buffer);
    this.free(buffer);
    return this.cut(read, most);
  }

  /** A text the reader writes as bytes into a buffer it is handed, cut to `most`. */
  writtenBytes(most: number, ask: (buffer: number, size: number) => number): string {
    const size = ask(0, 0);
    // One byte is the terminator alone: no text.
    if (size <= 1) return '';
    const buffer = this.alloc(size);
    ask(buffer, size);
    const read = BYTES.decode(this.heap.slice(buffer, buffer + size - 1));
    this.free(buffer);
    return this.cut(read, most);
  }

  withPage<T>(index: number, read: (page: number) => T): T | null {
    if (!this.doc || !Number.isInteger(index) || index < 0 || index >= this.count) return null;
    const page = this.p.FPDF_LoadPage(this.doc, index);
    if (!page) return null;
    try {
      return read(page);
    } finally {
      this.p.FPDF_ClosePage(page);
    }
  }

  /**
   * A page with the form told of it for as long as `read` runs: a tick box's state and a field's drawing are the
   * form's own answers, which it has once the page is the form's too. The form is 0 where the file has none.
   */
  withFormPage<T>(index: number, read: (page: number, form: number) => T): T | null {
    const form = this.formOf();
    return this.withPage(index, (page) => {
      if (!form) return read(page, 0);
      this.p.FORM_OnAfterLoadPage(page, form);
      try {
        return read(page, form);
      } finally {
        this.p.FORM_OnBeforeClosePage(page, form);
      }
    });
  }

  /** The form's environment for the open file; 0 where the file has no form. */
  formOf(): number {
    const { p } = this;
    if (!this.doc || p.FPDF_GetFormType(this.doc) === FORM_NONE) return 0;
    if (!this.form) {
      this.formInfo = p.PDFiumExt_OpenFormFillInfo();
      this.form = p.PDFiumExt_InitFormFillEnvironment(this.doc, this.formInfo);
    }
    return this.form;
  }

  close(): void {
    // The form's environment is ended before the file it was started for.
    if (this.form) this.p.PDFiumExt_ExitFormFillEnvironment(this.form);
    if (this.formInfo) this.p.PDFiumExt_CloseFormFillInfo(this.formInfo);
    if (this.doc) this.p.FPDF_CloseDocument(this.doc);
    if (this.memory) this.free(this.memory);
    this.forget();
  }

  /** Lets go of the file without a word to the reader: after a trap it answers nothing more. */
  forget(): void {
    this.photographs.clear();
    this.marksHidden = new Set();
    this.doc = 0;
    this.memory = 0;
    this.count = 0;
    this.form = 0;
    this.formInfo = 0;
  }
}
