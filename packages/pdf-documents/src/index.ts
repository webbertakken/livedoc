// A PDF document's pure parts (docs/specs/035-pdf-documents/pdf-document.md): its limits, its live changes, its
// marks. None of the engine comes with this entry; the engine is `@livedoc/pdf-documents/engine`.
export * from './limits';
export * from './custom-stamp';
export { isPdfBytes } from './sniff';
export { PageName } from './page-name';
export { PdfDate } from './pdf-date';
export {
  LINE_ENDS,
  LINE_MARK_KINDS,
  LINE_STYLES,
  MARK_KIND_LABELS,
  MARK_KINDS,
  Mark,
  POLY_MARK_KINDS,
  SHAPE_MARK_KINDS,
  STAMP_TURNS,
  TEXT_ALIGNS,
  TEXT_MARK_KINDS,
  TYPED_MARK_KINDS,
  type Box,
  type CalloutInput,
  type CalloutLine,
  type CalloutMark,
  type DrawingInput,
  type DrawingMark,
  type HighlightInput,
  type LineInput,
  type LineMark,
  type LineEnd,
  type LineMarkKind,
  type LineStyle,
  type MarkKind,
  type PolyInput,
  type PolyMark,
  type PolyMarkKind,
  type Quad,
  type Segment,
  type ShapeInput,
  type ShapeMark,
  type ShapeMarkKind,
  type StampInput,
  type StampMark,
  type StampTurnDegrees,
  type Stroke,
  type TextAlign,
  type TextBoxInput,
  type TextBoxMark,
  type TextMark,
  type TextMarkKind,
  type TypedMark,
  type TypedMarkKind,
} from './mark';
export {
  MarkDrawing,
  type BoxShape,
  type LineShape,
  type MarkShape,
  type MarkStroke,
  type PolyShape,
  type StampShape,
  type TypedShape,
} from './mark-drawing';
export { MarkErase } from './mark-erase';
export { MarkHit } from './mark-hit';
export { MarkPlace } from './mark-place';
export { MarkGroups } from './mark-groups';
export {
  BOX_HANDLES,
  MarkReshape,
  type BoxHandle,
  type CornerHandle,
  type MarkHandle,
  type PointHandle,
} from './mark-reshape';
export { MarkWords, type WordLine } from './mark-words';
export { STAMPS, Stamps, type Stamp, type StampTone } from './stamps';
export { StampLayout, type StampLine } from './stamp-layout';
export {
  STAMP_IDENTITY_FIELDS,
  StampIdentity,
  type StampIdentityField,
  type StampIdentityRead,
  type StampIdentityRefusal,
} from './stamp-identity';
export { StampTurn, type TurnWay } from './stamp-turn';
export { HelveticaBold } from './helvetica-bold';
export { TYPED_LINE_HEIGHT, TypedLayout, type PlacedLine, type TypedLine } from './typed-layout';
export { Helvetica, HELVETICA_STAND_IN } from './helvetica';
export { MarkFaces, type FacedLine, type MarkFaceSet, type MarkRun } from './mark-faces';
export { MARK_FACE_DATA, type MarkFaceData } from './mark-face-data';
export { MARK_FONT_DATA } from './mark-font-data';
export { MARK_FONT_FAMILIES, MARK_FONTS, MarkFonts } from './mark-fonts';
export { MARK_FACE_URLS } from './mark-face-urls';
export {
  MARK_FACE_REGIONS,
  MARK_FACE_REGIONS_BEFORE,
  type MarkFaceRegion,
  type MarkFaceSlice,
} from './mark-face-families';
export { MarkFaceSlices } from './mark-face-slices';
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
  type MarkChange,
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
