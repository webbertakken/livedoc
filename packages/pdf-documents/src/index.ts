// A PDF document's pure parts (docs/specs/035-pdf-documents/pdf-document.md): its limits, its live changes, its
// marks. None of the engine comes with this entry; the engine is `@livedoc/pdf-documents/engine`.
export * from './limits';
export { isPdfBytes } from './sniff';
export { PageName } from './page-name';
export { MARK_KINDS, Mark, type HighlightInput, type MarkKind, type Quad } from './mark';
export {
  PDF_ROOTS,
  PdfLiveChanges,
  type PdfLimitRefusal,
  type PdfRoot,
  type PdfStored,
} from './live-changes';
export { pdfDigest, type PdfDigest } from './digest';
export type {
  BakeRefusal,
  BakeResult,
  FileMark,
  Outline,
  OutlineItem,
  PageBitmap,
  PageInfo,
  PageLink,
  PageMatrix,
  PagePoint,
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
export { PageView } from './page-view';
export { PdfPermissions } from './permissions';
export { LinkTarget, type PdfActionKind } from './link-target';
export { PageText, type TextBox } from './page-text';
