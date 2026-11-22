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
  PageBitmap,
  PageInfo,
  PageMatrix,
  PagePoint,
  PdfEngine,
  PdfDocumentInfo,
  PdfOpened,
  PdfProperties,
  PdfRefusal,
  TextSelection,
} from './engine-contract';
export { PageView } from './page-view';
export { PdfPermissions } from './permissions';
