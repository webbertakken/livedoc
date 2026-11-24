// A PDF document's pure parts (docs/specs/035-pdf-documents/pdf-document.md): its limits, its live changes, its
// marks. None of the engine comes with this entry; the engine is `@livedoc/pdf-documents/engine`.
export * from './limits';
export { isPdfBytes } from './sniff';
export { PageName } from './page-name';
export {
  MARK_KINDS,
  Mark,
  TEXT_MARK_KINDS,
  type DrawingInput,
  type DrawingMark,
  type HighlightInput,
  type MarkKind,
  type Quad,
  type Stroke,
  type TextMark,
  type TextMarkKind,
} from './mark';
export { MarkDrawing, type MarkShape, type MarkStroke } from './mark-drawing';
export {
  PDF_ROOTS,
  PdfLiveChanges,
  type PdfLimitRefusal,
  type PdfRoot,
  type PdfStored,
} from './live-changes';
export { PDF_REVIEWING_ROOTS, pdfLevelAsked, type PdfLevelAsked } from './level-asked';
export { pdfDigest, type PdfDigest } from './digest';
export type {
  BakeRefusal,
  BakeResult,
  EmbeddedFileRead,
  FileMark,
  Outline,
  OutlineItem,
  PageBitmap,
  PageInfo,
  PageLink,
  PageMatrix,
  PagePoint,
  PageTurns,
  PageLook,
  TileRect,
  PdfEngine,
  PdfEngineLog,
  PdfDocumentInfo,
  PdfLayer,
  PdfOpened,
  PdfProperties,
  PdfRefusal,
  TextSelection,
} from './engine-contract';
export { EmbeddedFile, type EmbeddedFileInput, type EmbeddedFiles } from './embedded-file';
export type { FieldOption, PageField, PdfFieldType } from './file-field';
export {
  FileSignature,
  type Certification,
  type SignatureRead,
  type SignerCertificate,
} from './file-signature';
export { FieldValue } from './field-value';
export {
  PdfChange,
  PdfChangeset,
  type MarkLook,
  type PdfChangeRefusal,
  type PdfChangeRoot,
  type PdfChangesetResult,
  type PdfEntry,
  type RemovedKind,
} from './pdf-change';
export {
  PdfUnconfirmed,
  type PdfAnchors,
  type PdfCarried,
  type UnconfirmedChange,
} from './unconfirmed';
export { PageView } from './page-view';
export { PdfPermissions } from './permissions';
export { LinkTarget, type PdfActionKind } from './link-target';
export {
  PageTags,
  type TagElement,
  type TagKid,
  type TagNode,
  type TagReading,
  type TagsUnused,
} from './page-tags';
export { PageText, type TextBox } from './page-text';
export { TextRange, type TextSpan } from './text-range';
export { TextFind, type TextFindOptions } from './text-find';
export { DARK_INK, DARK_PAPER, DarkPages, type PixelBox } from './dark-pages';
