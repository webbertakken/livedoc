// The one interface a PDF is read, drawn and written through (docs/specs/035-pdf-documents/security.md "The
// boundary", opening.md "What is read", saving.md): the surface, the api and the CLI speak only this, never the
// library beneath it. Every value that crosses it is typed and bounded; nothing of a file crosses as markup.
import type { EmbeddedFiles } from './embedded-file';
import type { PageField } from './file-field';
import type { FileSignature } from './file-signature';
import type { LinkTarget } from './link-target';
import type { Quad } from './mark';
import type { PageName } from './page-name';
import type { PageText } from './page-text';
import type { PdfPermissions } from './permissions';

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
  /** The label the file gives the page ("iv", "A-3"), or null where it gives none. */
  readonly label: string | null;
};

/** The file's own properties, as text (opening.md "What is read": Metadata); empty where the file names none. */
export type PdfProperties = {
  readonly title: string;
  readonly author: string;
  readonly subject: string;
  readonly keywords: string;
  readonly creator: string;
  readonly producer: string;
  /** The dates as the file writes them (`D:20261121140203Z`). */
  readonly created: string;
  readonly modified: string;
};

/** What a file says of itself, read before any page is drawn. */
export type PdfDocumentInfo = {
  /** The PDF version the file names, as "1.7"; null where it names none. */
  readonly version: string | null;
  /** Whether the file is encrypted: by an open password, a permissions password, or both. */
  readonly encrypted: boolean;
  /** What its permissions ask, for the password it was opened with. */
  readonly permissions: PdfPermissions;
  readonly properties: PdfProperties;
  /** Whether it carries a structure tree (accessibility.md). */
  readonly tagged: boolean;
  /** Its interactive form: none, fields, or an XFA form (fields.md "XFA"). */
  readonly form: 'none' | 'fields' | 'xfa';
};

export type PdfOpened =
  | { readonly ok: true; readonly pages: readonly PageInfo[]; readonly document: PdfDocumentInfo }
  /**
   * An open password is asked, never a refusal (opening.md "Passwords"); `wrong`: the one given did not open it. The
   * engine holds the file meanwhile, and `unlock` gives it the password.
   */
  | { readonly ok: false; readonly needsPassword: true; readonly wrong?: true }
  | { readonly ok: false; readonly needsPassword?: false; readonly refusal: PdfRefusal };

/** A page drawn: RGBA, four bytes a pixel, row by row. */
export type PageBitmap = {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Page space to view space for this page; marks are placed and drawn through it. */
  readonly toView: PageMatrix;
};

/** A bookmark: an entry of the file's outline (document-tools.md "Bookmarks"). */
export type OutlineItem = {
  readonly title: string;
  /** How deep it is nested: 0 at the top. The outline is a list in reading order. */
  readonly depth: number;
  /** Where it leads; null where the file names nowhere a reader can go. */
  readonly target: LinkTarget | null;
};

export type Outline = {
  readonly items: readonly OutlineItem[];
  /** Whether the file holds more bookmarks than were read (`PDF_OUTLINE_MAX_ITEMS`). */
  readonly cut: boolean;
};

/** A link on a page: its box in page space as left, bottom, right, top, and where it leads. */
export type PageLink = {
  readonly rect: readonly [number, number, number, number];
  readonly target: LinkTarget;
};

/** A point in page space. */
export type PagePoint = { readonly x: number; readonly y: number };

/** The text between two points of a page, with the quadrilaterals of the glyphs it covers, in page space. */
export type TextSelection = { readonly text: string; readonly quads: readonly Quad[] };

/** A mark the file itself holds, as the file says it (marks.md "In the file", comments.md "In the file"). */
export type FileMark = {
  /** Its `NM` where it has one, else `o:<object number>`. */
  readonly id: string;
  /** The file's own word for it, in lower case (`highlight`, `text`, `ink`). */
  readonly subtype: string;
  /** Its box in page space: left, bottom, right, top. */
  readonly rect: readonly [number, number, number, number];
  /** The glyphs a text mark covers; none for every other kind. */
  readonly quads: readonly Quad[];
  /** `#rrggbb`; null where the file names no colour. */
  readonly colour: string | null;
  /** 0 to 1; 1 where the file names none. */
  readonly opacity: number;
  /** The name the file gives as its author. A file can say any name: it is never a LiveDoc person's. */
  readonly author: string;
  /** Its words: the first comment of its thread, or a Text mark's text. */
  readonly words: string;
  /** The short label its maker gave it; empty where there is none. */
  readonly subject: string;
  /** The dates as the file writes them (`D:20261121140203Z`); empty where it gives none. */
  readonly created: string;
  readonly modified: string;
  /** The mark it answers, by id, and whether it is grouped with it rather than a reply; null for a mark of its own. */
  readonly answers: { readonly mark: string; readonly grouped: boolean } | null;
  /** A state reply's state (`Review`, `Accepted`); null for every other mark. */
  readonly state: { readonly model: string; readonly state: string } | null;
};

/** A PDF layer: optional content a file shows or hides (reading-surface.md "The left panel"). */
export type PdfLayer = {
  /** `o:<object number>`. */
  readonly id: string;
  readonly name: string;
  /** Whether the file shows it as it opens. */
  readonly visible: boolean;
  /** Whether the file asks that its state is not changed. */
  readonly locked: boolean;
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
  /**
   * Opens the file the engine holds with a password: the one it asked for, or the permissions password of a file
   * already open, which a wrong one leaves open as it was. The password stays in the engine for as long as the file
   * is open, for a bake, and nowhere else (opening.md "Passwords").
   */
  unlock(password: string): Promise<PdfOpened>;
  /** The page at that place in the order, drawn at `scale` (1 is 72 dpi), the file's own marks included. */
  drawPage(index: number, scale: number): Promise<PageBitmap | null>;
  /** The file's bookmarks, in reading order; none where it has no outline. */
  outline(): Promise<Outline>;
  /** The links on a page, none of them followed. */
  links(index: number): Promise<readonly PageLink[]>;
  /** A page's text with each character's box, or null where there is no such page. */
  pageText(index: number): Promise<PageText | null>;
  /** The text between two points of a page, or null where there is none. */
  selectText(index: number, from: PagePoint, to: PagePoint): Promise<TextSelection | null>;
  /** The marks the file itself holds on a page. */
  fileMarks(index: number): Promise<readonly FileMark[]>;
  /** The places on a page where the file's fields show, each with its field's value. */
  fields(index: number): Promise<readonly PageField[]>;
  /** The certificate signatures the file holds, as read: none is checked here. */
  signatures(): Promise<readonly FileSignature[]>;
  /** The files the PDF carries inside it, listed and never opened. */
  embeddedFiles(): Promise<EmbeddedFiles>;
  /** The file's PDF layers, in the file's order; none where it has none. */
  layers(): Promise<readonly PdfLayer[]>;
  /** The open stored file with the live changes (one Yjs update) written in. */
  bake(liveChanges: Uint8Array): Promise<BakeResult>;
  close(): Promise<void>;
};
