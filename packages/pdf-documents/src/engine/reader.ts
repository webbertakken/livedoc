// Reading and drawing a PDF with PDFium in WebAssembly (docs/specs/035-pdf-documents/opening.md "What is read",
// security.md "The boundary"). The only file that drives the reader's C interface; everything it answers is typed
// and bounded on the way out. No script runtime is built into the engine, so no script of a file can run.
import { init, type WrappedPdfiumModule } from '@embedpdf/pdfium';
import type {
  FileMark,
  Outline,
  OutlineItem,
  PageBitmap,
  PageInfo,
  PageLink,
  PageMatrix,
  PagePoint,
  PdfDocumentInfo,
  PdfOpened,
  PdfRefusal,
  TextSelection,
} from '../engine-contract';
import {
  PDF_LINK_MAX_CHARS,
  PDF_MARK_MAX_QUADS,
  PDF_MARK_TEXT_MAX_CHARS,
  PDF_MAX_PAGE_PIXELS,
  PDF_MAX_PAGE_POINTS,
  PDF_MAX_TREE_DEPTH,
  PDF_NAME_MAX_CHARS,
  PDF_OUTLINE_MAX_ITEMS,
  PDF_PAGE_MAX_LINKS,
  PDF_PAGE_TEXT_MAX_CHARS,
  PDF_PROPERTY_MAX_CHARS,
} from '../limits';
import { LinkTarget, type PdfActionKind } from '../link-target';
import type { Quad } from '../mark';
import { PageName } from '../page-name';
import { PageText } from '../page-text';
import { PdfPermissions } from '../permissions';

export type Pdfium = WrappedPdfiumModule;

// The part of the reader's runtime this file uses, typed here: the package types it by globals a consumer lacks.
type Runtime = {
  readonly HEAPU8: Uint8Array;
  readonly wasmExports: { malloc(size: number): number; free(pointer: number): void };
  getValue(pointer: number, type: 'float' | 'double' | 'i32'): number;
  UTF16ToString(pointer: number): string;
};

// FPDF_GetFormType's answers; every other is an XFA form.
const FORM_NONE = 0;
const FORM_FIELDS = 1;
// FPDFAction_GetType's answers: a place here, another file, an address; the rest are named and never performed.
const ACTION_GO_TO = 1;
const ACTION_OTHER_FILE = 2;
const ACTION_ADDRESS = 3;
const ACTIONS: Readonly<Record<number, PdfActionKind>> = { 4: 'launch', 5: 'embedded-file' };
const BYTES = new TextDecoder();
// FPDF_GetLastError's answers.
const ERROR_PASSWORD = 4;
const ERROR_SECURITY = 5;
// FPDFBitmap_BGRA; FPDF_ANNOT draws the file's own marks, FPDF_REVERSE_BYTE_ORDER answers RGBA.
const BITMAP_BGRA = 4;
const RENDER_FLAGS = 0x01 | 0x10;
const WHITE = 0xffffffff;
// How far from a glyph a point still picks it, in points: half a line of body text.
const PICK_TOLERANCE = 6;
// The scale FPDF_PageToDevice is asked at, so its whole-number answers keep a thousandth of a point.
const MATRIX_PRECISION = 1000;
const MATRIX_PROBE = 1000;
// The file's own words for what sits on a page, by the reader's number; a link, a pop-up and a field's widget are
// not marks.
const SUBTYPES: Readonly<Record<number, string>> = {
  1: 'text',
  3: 'freetext',
  4: 'line',
  5: 'square',
  6: 'circle',
  7: 'polygon',
  8: 'polyline',
  9: 'highlight',
  10: 'underline',
  11: 'squiggly',
  12: 'strikeout',
  13: 'stamp',
  14: 'caret',
  15: 'ink',
  17: 'fileattachment',
};
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

const clampSide = (points: number): number =>
  Number.isFinite(points) ? Math.min(Math.max(points, 1), PDF_MAX_PAGE_POINTS) : 1;

/** One open PDF. The bytes are copied into the reader's own memory, which it reads from until closed. */
export class PdfReader {
  private readonly p: Pdfium;
  private doc = 0;
  private memory = 0;
  private count = 0;

  constructor(pdfium: Pdfium) {
    this.p = pdfium;
  }

  private get runtime(): Runtime {
    return this.p.pdfium;
  }

  private get heap(): Uint8Array {
    return this.runtime.HEAPU8;
  }

  private alloc(size: number): number {
    return this.runtime.wasmExports.malloc(size);
  }

  private free(pointer: number): void {
    this.runtime.wasmExports.free(pointer);
  }

  /** Opens the bytes, with the password given; none is the empty one, which opens a file that asks for none. */
  open(bytes: Uint8Array, password = ''): PdfOpened {
    this.close();
    const { p } = this;
    try {
      this.memory = this.alloc(bytes.length);
      this.heap.set(bytes, this.memory);
      this.doc = p.FPDF_LoadMemDocument(this.memory, bytes.length, password);
      if (!this.doc) {
        const error = p.FPDF_GetLastError();
        this.close();
        if (error === ERROR_PASSWORD) return { ok: false, needsPassword: true };
        return { ok: false, refusal: refusalOf(error, bytes) };
      }
      this.count = p.FPDF_GetPageCount(this.doc);
      if (this.count <= 0) {
        this.close();
        return { ok: false, refusal: 'pdf_newer' };
      }
      return { ok: true, pages: this.pages(), document: this.document() };
    } catch {
      // A trap inside the reader: it is ended here, and a fresh one serves the next file.
      this.doc = 0;
      this.memory = 0;
      this.count = 0;
      return { ok: false, refusal: 'pdf_stopped' };
    }
  }

  private pages(): PageInfo[] {
    const { p } = this;
    const size = this.alloc(8);
    const pages: PageInfo[] = [];
    // A file that labels its pages labels its first: one read tells whether any page has a label to read.
    const labelled = this.labelOf(0) !== null;
    for (let index = 0; index < this.count; index += 1) {
      const sized = p.FPDF_GetPageSizeByIndexF(this.doc, index, size);
      pages.push({
        name: PageName.ofObject(p.EPDFDoc_GetPageObjectNumberByIndex(this.doc, index)),
        width: clampSide(sized ? this.runtime.getValue(size, 'float') : 0),
        height: clampSide(sized ? this.runtime.getValue(size + 4, 'float') : 0),
        label: labelled ? this.labelOf(index) : null,
      });
    }
    this.free(size);
    return pages;
  }

  /** A text the reader writes as UTF-16 into a buffer it is handed, cut to `most`; `ask` answers the bytes needed. */
  private written(most: number, ask: (buffer: number, size: number) => number): string {
    const size = ask(0, 0);
    // Two bytes is the terminator alone: no text.
    if (size <= 2) return '';
    const buffer = this.alloc(size);
    ask(buffer, size);
    const read = this.runtime.UTF16ToString(buffer);
    this.free(buffer);
    return read.slice(0, most);
  }

  private labelOf(index: number): string | null {
    const label = this.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
      this.p.FPDF_GetPageLabel(this.doc, index, buffer, size),
    );
    return label === '' ? null : label;
  }

  private property(tag: string): string {
    return this.written(PDF_PROPERTY_MAX_CHARS, (buffer, size) =>
      this.p.FPDF_GetMetaText(this.doc, tag, buffer, size),
    );
  }

  private version(): string | null {
    const out = this.alloc(4);
    const named = this.p.FPDF_GetFileVersion(this.doc, out);
    const version = this.runtime.getValue(out, 'i32');
    this.free(out);
    // The reader answers 17 for 1.7.
    return named && version >= 10 ? `${Math.floor(version / 10)}.${version % 10}` : null;
  }

  private document(): PdfDocumentInfo {
    const { p } = this;
    const form = p.FPDF_GetFormType(this.doc);
    return {
      version: this.version(),
      encrypted: p.FPDF_GetSecurityHandlerRevision(this.doc) >= 0,
      permissions: PdfPermissions.of(p.FPDF_GetDocPermissions(this.doc)),
      properties: {
        title: this.property('Title'),
        author: this.property('Author'),
        subject: this.property('Subject'),
        keywords: this.property('Keywords'),
        creator: this.property('Creator'),
        producer: this.property('Producer'),
        created: this.property('CreationDate'),
        modified: this.property('ModDate'),
      },
      tagged: Boolean(p.FPDFCatalog_IsTagged(this.doc)),
      form: form === FORM_NONE ? 'none' : form === FORM_FIELDS ? 'fields' : 'xfa',
    };
  }

  private withPage<T>(index: number, read: (page: number) => T): T | null {
    if (!this.doc || !Number.isInteger(index) || index < 0 || index >= this.count) return null;
    const page = this.p.FPDF_LoadPage(this.doc, index);
    if (!page) return null;
    try {
      return read(page);
    } finally {
      this.p.FPDF_ClosePage(page);
    }
  }

  private toDevice(page: number, width: number, height: number, x: number, y: number): PagePoint {
    const { p } = this;
    const out = this.alloc(8);
    p.FPDF_PageToDevice(
      page,
      0,
      0,
      Math.round(width * MATRIX_PRECISION),
      Math.round(height * MATRIX_PRECISION),
      0,
      x,
      y,
      out,
      out + 4,
    );
    const point = {
      x: this.runtime.getValue(out, 'i32') / MATRIX_PRECISION,
      y: this.runtime.getValue(out + 4, 'i32') / MATRIX_PRECISION,
    };
    this.free(out);
    return point;
  }

  private matrixOf(page: number, width: number, height: number): PageMatrix {
    const origin = this.toDevice(page, width, height, 0, 0);
    const alongX = this.toDevice(page, width, height, MATRIX_PROBE, 0);
    const alongY = this.toDevice(page, width, height, 0, MATRIX_PROBE);
    return [
      (alongX.x - origin.x) / MATRIX_PROBE,
      (alongX.y - origin.y) / MATRIX_PROBE,
      (alongY.x - origin.x) / MATRIX_PROBE,
      (alongY.y - origin.y) / MATRIX_PROBE,
      origin.x,
      origin.y,
    ];
  }

  drawPage(index: number, scale: number): PageBitmap | null {
    const { p } = this;
    return this.withPage(index, (page) => {
      const pageWidth = clampSide(p.FPDF_GetPageWidthF(page));
      const pageHeight = clampSide(p.FPDF_GetPageHeightF(page));
      const asked = Number.isFinite(scale) && scale > 0 ? scale : 1;
      // A draw never passes the pixel ceiling: the scale gives way, the page still shows.
      const fit = Math.min(asked, Math.sqrt(PDF_MAX_PAGE_PIXELS / (pageWidth * pageHeight)));
      const width = Math.max(1, Math.floor(pageWidth * fit));
      const height = Math.max(1, Math.floor(pageHeight * fit));
      const bitmap = p.FPDFBitmap_CreateEx(width, height, BITMAP_BGRA, 0, 0);
      if (!bitmap) return null;
      p.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, WHITE);
      p.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, RENDER_FLAGS);
      const buffer = p.FPDFBitmap_GetBuffer(bitmap);
      const stride = p.FPDFBitmap_GetStride(bitmap);
      const rgba = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row += 1)
        rgba.set(
          this.heap.subarray(buffer + row * stride, buffer + row * stride + width * 4),
          row * width * 4,
        );
      p.FPDFBitmap_Destroy(bitmap);
      return { width, height, rgba, toView: this.matrixOf(page, pageWidth, pageHeight) };
    });
  }

  /** A text the reader writes as bytes into a buffer it is handed, cut to `most`. */
  private writtenBytes(most: number, ask: (buffer: number, size: number) => number): string {
    const size = ask(0, 0);
    // One byte is the terminator alone: no text.
    if (size <= 1) return '';
    const buffer = this.alloc(size);
    ask(buffer, size);
    const read = BYTES.decode(this.heap.slice(buffer, buffer + size - 1));
    this.free(buffer);
    return read.slice(0, most);
  }

  /** The place in this document a destination names, or null where it names none that is here. */
  private placeOf(destination: number): LinkTarget | null {
    const { p } = this;
    const index = p.FPDFDest_GetDestPageIndex(this.doc, destination);
    if (index < 0 || index >= this.count) return null;
    // Three flags (whether x, y and zoom are named), then the three numbers.
    const out = this.alloc(24);
    const located = p.FPDFDest_GetLocationInPage(
      destination,
      out,
      out + 4,
      out + 8,
      out + 12,
      out + 16,
      out + 20,
    );
    const named = (flag: number, value: number): number | null => {
      const read = this.runtime.getValue(value, 'float');
      return located && this.runtime.getValue(flag, 'i32') !== 0 && Number.isFinite(read)
        ? read
        : null;
    };
    const place: LinkTarget = {
      kind: 'place',
      page: PageName.ofObject(p.EPDFDoc_GetPageObjectNumberByIndex(this.doc, index)),
      x: named(out, out + 12),
      y: named(out + 4, out + 16),
    };
    this.free(out);
    return place;
  }

  /**
   * What an action of the file asks: read and named, never performed (security.md "Links and actions"). An action is
   * read before any destination: the reader answers the place another file's link names as a place in this one.
   */
  private targetOf(action: number): LinkTarget | null {
    const { p } = this;
    const kind = p.FPDFAction_GetType(action);
    if (kind === ACTION_GO_TO) {
      const destination = p.FPDFAction_GetDest(this.doc, action);
      return destination ? this.placeOf(destination) : null;
    }
    if (kind === ACTION_ADDRESS) {
      // One past the limit, so an address too long is seen to be.
      return LinkTarget.ofAddress(
        this.writtenBytes(PDF_LINK_MAX_CHARS + 1, (buffer, size) =>
          p.FPDFAction_GetURIPath(this.doc, action, buffer, size),
        ),
      );
    }
    if (kind === ACTION_OTHER_FILE) {
      const path = this.writtenBytes(PDF_NAME_MAX_CHARS, (buffer, size) =>
        p.FPDFAction_GetFilePath(action, buffer, size),
      );
      return { kind: 'file', path };
    }
    return { kind: 'action', action: ACTIONS[kind] ?? 'other' };
  }

  /** The bookmarks in reading order, at most `most`; a walk never reads a bookmark twice, nor past the depth limit. */
  outline(most = PDF_OUTLINE_MAX_ITEMS): Outline {
    const { p } = this;
    const items: OutlineItem[] = [];
    if (!this.doc) return { items, cut: false };
    const read = new Set<number>();
    let cut = false;
    const walk = (parent: number, depth: number): void => {
      if (depth >= PDF_MAX_TREE_DEPTH) return;
      for (
        let item = p.FPDFBookmark_GetFirstChild(this.doc, parent);
        item !== 0 && !read.has(item) && !cut;
        item = p.FPDFBookmark_GetNextSibling(this.doc, item)
      ) {
        if (items.length >= most) {
          cut = true;
          return;
        }
        read.add(item);
        const action = p.FPDFBookmark_GetAction(item);
        const destination = action ? 0 : p.FPDFBookmark_GetDest(this.doc, item);
        items.push({
          title: this.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
            p.FPDFBookmark_GetTitle(item, buffer, size),
          ),
          depth,
          target: action ? this.targetOf(action) : destination ? this.placeOf(destination) : null,
        });
        walk(item, depth + 1);
      }
    };
    walk(0, 0);
    return { items, cut };
  }

  /** The links on a page, at most `most`, each with its box and where it leads. */
  links(index: number, most = PDF_PAGE_MAX_LINKS): readonly PageLink[] {
    const { p } = this;
    const links: PageLink[] = [];
    this.withPage(index, (page) => {
      // Where the walk is, the link it found, then the link's box: left, top, right, bottom.
      const out = this.alloc(24);
      this.heap.fill(0, out, out + 24);
      while (links.length < most && p.FPDFLink_Enumerate(page, out, out + 4)) {
        const link = this.runtime.getValue(out + 4, 'i32');
        if (!p.FPDFLink_GetAnnotRect(link, out + 8)) continue;
        const side = (at: number): number => {
          const read = this.runtime.getValue(out + 8 + at * 4, 'float');
          return Number.isFinite(read) ? read : 0;
        };
        const action = p.FPDFLink_GetAction(link);
        const destination = action ? 0 : p.FPDFLink_GetDest(this.doc, link);
        const target = destination
          ? this.placeOf(destination)
          : action
            ? this.targetOf(action)
            : null;
        if (target) links.push({ rect: [side(0), side(3), side(2), side(1)], target });
      }
      this.free(out);
    });
    return links;
  }

  /** The page's text, at most `most` characters of it, each with its box. */
  pageText(index: number, most = PDF_PAGE_TEXT_MAX_CHARS): PageText | null {
    const { p } = this;
    return this.withPage(index, (page) => {
      const text = p.FPDFText_LoadPage(page);
      if (!text) return PageText.of([], []);
      // Four doubles: left, right, bottom, top, as the reader writes a character's box.
      const out = this.alloc(32);
      try {
        const held = Math.max(p.FPDFText_CountChars(text), 0);
        const count = Math.min(held, most);
        const codes = new Uint32Array(count);
        const boxes = new Float32Array(count * 4);
        const unmapped: number[] = [];
        for (let at = 0; at < count; at += 1) {
          codes[at] = p.FPDFText_GetUnicode(text, at);
          if (p.FPDFText_HasUnicodeMapError(text, at) === 1) unmapped.push(at);
          if (!p.FPDFText_GetCharBox(text, at, out, out + 8, out + 16, out + 24)) continue;
          boxes[at * 4] = this.runtime.getValue(out, 'double');
          boxes[at * 4 + 1] = this.runtime.getValue(out + 16, 'double');
          boxes[at * 4 + 2] = this.runtime.getValue(out + 8, 'double');
          boxes[at * 4 + 3] = this.runtime.getValue(out + 24, 'double');
        }
        return PageText.of(codes, boxes, { unmapped, cut: held > count });
      } finally {
        this.free(out);
        p.FPDFText_ClosePage(text);
      }
    });
  }

  selectText(index: number, from: PagePoint, to: PagePoint): TextSelection | null {
    const { p } = this;
    return this.withPage(index, (page) => {
      const text = p.FPDFText_LoadPage(page);
      if (!text) return null;
      try {
        const pick = ({ x, y }: PagePoint) =>
          Number.isFinite(x) && Number.isFinite(y)
            ? p.FPDFText_GetCharIndexAtPos(text, x, y, PICK_TOLERANCE, PICK_TOLERANCE)
            : -1;
        const a = pick(from);
        const b = pick(to);
        if (a < 0 || b < 0) return null;
        const start = Math.min(a, b);
        const count = Math.min(Math.abs(a - b) + 1, PDF_MARK_TEXT_MAX_CHARS);
        const quads = this.rectsOf(text, start, count);
        return quads.length === 0 ? null : { text: this.textOf(text, start, count), quads };
      } finally {
        p.FPDFText_ClosePage(text);
      }
    });
  }

  private rectsOf(text: number, start: number, count: number): Quad[] {
    const { p } = this;
    const rects = Math.min(p.FPDFText_CountRects(text, start, count), PDF_MARK_MAX_QUADS);
    const out = this.alloc(32);
    const quads: Quad[] = [];
    for (let n = 0; n < rects; n += 1) {
      if (!p.FPDFText_GetRect(text, n, out, out + 8, out + 16, out + 24)) continue;
      const [left, top, right, bottom] = [0, 8, 16, 24].map((at) =>
        this.runtime.getValue(out + at, 'double'),
      ) as [number, number, number, number];
      if (![left, top, right, bottom].every(Number.isFinite)) continue;
      quads.push([left, top, right, top, left, bottom, right, bottom]);
    }
    this.free(out);
    return quads;
  }

  private textOf(text: number, start: number, count: number): string {
    const { p } = this;
    const size = (count + 1) * 2;
    const buffer = this.alloc(size);
    p.FPDFText_GetText(text, start, count, buffer);
    const read = this.runtime.UTF16ToString(buffer);
    this.free(buffer);
    return read;
  }

  fileMarks(index: number): readonly FileMark[] {
    const { p } = this;
    return (
      this.withPage(index, (page) => {
        const marks: FileMark[] = [];
        const count = p.FPDFPage_GetAnnotCount(page);
        for (let n = 0; n < count; n += 1) {
          const annotation = p.FPDFPage_GetAnnot(page, n);
          if (!annotation) continue;
          const subtype = SUBTYPES[p.FPDFAnnot_GetSubtype(annotation)];
          if (subtype)
            marks.push({
              id: this.nameOf(annotation) ?? `o:${p.EPDFAnnot_GetObjectNumber(annotation)}`,
              subtype,
              quads: this.quadsOf(annotation),
            });
          p.FPDFPage_CloseAnnot(annotation);
        }
        return marks;
      }) ?? []
    );
  }

  private nameOf(annotation: number): string | null {
    const { p } = this;
    const size = p.FPDFAnnot_GetStringValue(annotation, 'NM', 0, 0);
    // Two bytes is the terminator alone: no name.
    if (size <= 2) return null;
    const buffer = this.alloc(size);
    p.FPDFAnnot_GetStringValue(annotation, 'NM', buffer, size);
    const name = this.runtime.UTF16ToString(buffer);
    this.free(buffer);
    return name === '' ? null : name.slice(0, PDF_NAME_MAX_CHARS);
  }

  private quadsOf(annotation: number): Quad[] {
    const { p } = this;
    const count = Math.min(p.FPDFAnnot_CountAttachmentPoints(annotation), PDF_MARK_MAX_QUADS);
    const out = this.alloc(32);
    const quads: Quad[] = [];
    for (let n = 0; n < count; n += 1) {
      if (!p.FPDFAnnot_GetAttachmentPoints(annotation, n, out)) continue;
      const quad = [0, 4, 8, 12, 16, 20, 24, 28].map((at) =>
        this.runtime.getValue(out + at, 'float'),
      );
      if (quad.every(Number.isFinite)) quads.push(quad as unknown as Quad);
    }
    this.free(out);
    return quads;
  }

  /** How many pages the open file has; 0 when none is open. */
  pageCount(): number {
    return this.count;
  }

  close(): void {
    if (this.doc) this.p.FPDF_CloseDocument(this.doc);
    if (this.memory) this.free(this.memory);
    this.doc = 0;
    this.memory = 0;
    this.count = 0;
  }
}

function refusalOf(error: number, bytes: Uint8Array): PdfRefusal {
  if (error !== ERROR_SECURITY) return 'pdf_damaged';
  return holds(bytes, CERTIFICATE_HANDLER) ? 'pdf_certificate_protected' : 'pdf_rights_protected';
}
