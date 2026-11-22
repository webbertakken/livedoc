// The one interface a PDF is read, drawn and written through (docs/specs/035-pdf-documents/security.md "The
// boundary", opening.md "What is read", saving.md): the surface, the api and the CLI speak only this, never the
// library beneath it. Every value that crosses it is typed and bounded; nothing of a file crosses as markup.
import type { Quad } from './mark';
import type { PageName } from './page-name';

/** A named reason a PDF is not opened (opening.md "Refusals"). */
export type PdfRefusal =
  | 'pdf_damaged'
  | 'pdf_newer'
  | 'pdf_certificate_protected'
  | 'pdf_rights_protected'
  | 'pdf_stopped';

/**
 * Page space to view space as `[a, b, c, d, e, f]`: `x' = a·x + c·y + e`, `y' = b·x + d·y + f`. View space is the
 * page as shown at 72 dpi, its rotation applied, its origin the top left corner, y running down.
 */
export type PageMatrix = readonly [number, number, number, number, number, number];

export type PageInfo = {
  readonly name: PageName;
  /** The page as shown, its rotation applied, in points. */
  readonly width: number;
  readonly height: number;
};

export type PdfOpened =
  | { readonly ok: true; readonly pages: readonly PageInfo[] }
  /** An open password is asked, never a refusal (opening.md "Passwords"). */
  | { readonly ok: false; readonly needsPassword: true }
  | { readonly ok: false; readonly needsPassword?: false; readonly refusal: PdfRefusal };

/** A page drawn: RGBA, four bytes a pixel, row by row. */
export type PageBitmap = {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Page space to view space for this page; marks are placed and drawn through it. */
  readonly toView: PageMatrix;
};

/** A point in page space. */
export type PagePoint = { readonly x: number; readonly y: number };

/** The text between two points of a page, with the quadrilaterals of the glyphs it covers, in page space. */
export type TextSelection = { readonly text: string; readonly quads: readonly Quad[] };

/** A mark the file itself holds, as far as the engine reads it. */
export type FileMark = {
  /** Its `NM` where it has one, else `o:<object number>`. */
  readonly id: string;
  /** The file's own word for it, in lower case (`highlight`, `text`, `ink`). */
  readonly subtype: string;
  readonly quads: readonly Quad[];
};

/** Why a bake was not handed out (saving.md "The validators' claim", "Addition or rewrite"). */
export type BakeRefusal = 'cannot-append' | 'reopen' | 'unreadable';

export type BakeResult =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array<ArrayBuffer>;
      /** `unchanged`: the stored file itself; `addition`: the stored file with one incremental update. */
      readonly kind: 'unchanged' | 'addition';
      /** Marks whose page the stored file does not hold. */
      readonly anchorsLost: number;
    }
  | { readonly ok: false; readonly refusal: BakeRefusal };

export type PdfEngine = {
  /** Opens the stored file; whatever was open before is closed. */
  open(bytes: Uint8Array<ArrayBuffer>): Promise<PdfOpened>;
  /** The page at that place in the order, drawn at `scale` (1 is 72 dpi), the file's own marks included. */
  drawPage(index: number, scale: number): Promise<PageBitmap | null>;
  /** The text between two points of a page, or null where there is none. */
  selectText(index: number, from: PagePoint, to: PagePoint): Promise<TextSelection | null>;
  /** The marks the file itself holds on a page. */
  fileMarks(index: number): Promise<readonly FileMark[]>;
  /** The open stored file with the live changes (one Yjs update) written in. */
  bake(liveChanges: Uint8Array): Promise<BakeResult>;
  close(): Promise<void>;
};
