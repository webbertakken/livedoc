// The text document (docs/specs/034-text-documents/text-document.md): its model, its live state, and its mapping onto
// the open standards (standard-mapping.md), shared by the editor, the api, the MCP server and the CLI.
export { Body, type Paragraph as BodyParagraph } from './body';
export {
  KEPT_CONTENT_MAX_BYTES,
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_FRAME_CHARS,
  TEXT_DOCUMENT_LOCAL_SAVE_MS,
  TEXT_DOCUMENT_LOG_BYTES,
  TEXT_DOCUMENT_LOG_UPDATES,
  TEXT_DOCUMENT_MAX_CHARS,
  TEXT_DOCUMENT_MAX_STATE_BYTES,
  TEXT_DOCUMENT_UNDO_GROUP_MS,
  TEXT_DOCUMENT_UPDATE_MAX_BYTES,
  TEXT_DOCUMENT_WORDS_PER_PAGE,
} from './limits';
export { textDocumentDigest, type TextDocumentDigest } from './digest';
export { textDocumentPageSvg } from './art/page-svg';
export { BODY_FRAGMENT, TEXT_DOCUMENT_SEED_CLIENT, TextDocumentState } from './text-document-state';
export {
  TEXT_DOCUMENT_FILE_TYPES,
  isTextDocumentFileType,
  type TextDocumentFileType,
} from './file-types';
export { base64OfBytes, bytesOfBase64 } from './base64';
export {
  Paragraph,
  type Block,
  type Inline,
  type KeptBlock,
  type KeptInline,
  type Run,
  type SectionBreak,
} from './model/blocks';
export {
  CHECK_MARKS,
  LIST_LEVELS,
  ListDefinition,
  NUMBER_FORMATS,
  type ListLevel,
  type ListPlace,
  type NumberFormat,
} from './model/lists';
export {
  canonical,
  type KeptProperties,
  type LineHeight,
  type ParagraphProps,
  type TextProps,
} from './model/props';
export { PAPER, PageSetup, type Margins, type Section, type SectionStart } from './model/sections';
export {
  ROLE_IDS,
  roleOfStyleName,
  STYLE_ROLES,
  Styles,
  type Style,
  type StyleDefaults,
  type StyleRole,
} from './model/styles';
export {
  TextDocument,
  type BlankOptions,
  type KeptEntry,
  type OdfSource,
  type OoxmlSource,
  type TextDocumentFormat,
} from './model/text-document';
export {
  readTextDocumentFile,
  writeTextDocumentFile,
  type ReadLimits,
  type TextDocumentRead,
  type TextDocumentWrite,
} from './files';
export { conversionLosses, convertTextDocument, type ConversionLoss } from './convert';
export { isSafeLink, type DroppedReason, type ImportReport, type ReportItem } from './report';
export {
  BODY_BLOCKS,
  KEPT_BLOCK,
  KEPT_BLOCK_ATTRIBUTES,
  KEPT_INLINE,
  KEPT_INLINE_ATTRIBUTES,
  PARAGRAPH_ATTRIBUTES,
  RUN_MARKS,
  SECTION_BREAK,
  SECTION_BREAK_ATTRIBUTES,
} from './live/live-names';
export { keptPresenceOf, type KeptPresence } from './live/kept-presence';
