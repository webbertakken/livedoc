// The text document (docs/specs/034-text-documents/text-document.md): its model, its live state, and its mapping onto
// the open standards (standard-mapping.md), shared by the editor, the api, the MCP server and the CLI.
export { Body, type Paragraph as BodyParagraph } from './body';
export { odfSectionRegion } from './odf/odf-region';
export {
  KEPT_CONTENT_MAX_BYTES,
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_FRAME_CHARS,
  TEXT_DOCUMENT_LOCAL_SAVE_MS,
  TEXT_DOCUMENT_SAVE_RETRY_MS,
  TEXT_DOCUMENT_LOG_BYTES,
  TEXT_DOCUMENT_LOG_UPDATES,
  TEXT_DOCUMENT_MAX_CHARS,
  TEXT_DOCUMENT_MAX_STATE_BYTES,
  TEXT_DOCUMENT_UNDO_GROUP_MS,
  TEXT_DOCUMENT_UPDATE_MAX_BYTES,
  TEXT_DOCUMENT_WORDS_PER_PAGE,
} from './limits';
export { textDocumentDigest, type TextDocumentDigest } from './digest';
export {
  liveFirstHeaders,
  liveSectionHeaders,
  liveNoteIds,
  liveStoryIds,
  STORY_PREFIX,
  storyFragment,
  type LiveHeaders,
  type LiveStory,
} from './live/live-stories';
export { textDocumentPageSvg } from './art/page-svg';
export { BODY_FRAGMENT, TEXT_DOCUMENT_SEED_CLIENT, TextDocumentState } from './text-document-state';
export {
  TEXT_DOCUMENT_FILE_TYPES,
  isTextDocumentFileType,
  type TextDocumentFileType,
} from './file-types';
export { base64OfBytes, bytesOfBase64 } from './base64';
export {
  FIELD_KINDS,
  Paragraph,
  type Block,
  type Field,
  type FieldKind,
  type Inline,
  type KeptBlock,
  type KeptInline,
  type Note,
  type Run,
  type SectionBreak,
} from './model/blocks';
export { Notes } from './model/notes';
export {
  CHECK_MARKS,
  LIST_LEVELS,
  LIST_RESTART_MAX,
  LIST_RESTART_MIN,
  ListDefinition,
  NUMBER_FORMATS,
  type ListLevel,
  type ListPlace,
  type NumberFormat,
} from './model/lists';
export {
  DEFAULT_TAB_INTERVAL_PT,
  TAB_STOP_MAX_PT,
  TAB_STOPS_MAX,
  TabStops,
  type TabAlign,
  type TabLeader,
  type TabStop,
} from './model/tab-stops';
export { ListMarkers, numberText, type ListMarker } from './model/list-markers';
export { LIST_PRESETS, ListPresets, type ListKind, type ListPreset } from './model/list-presets';
export {
  BORDER_SIDES,
  canonical,
  type BorderDash,
  type BorderLine,
  type BorderSide,
  type KeptProperties,
  type LineHeight,
  type ParagraphBorders,
  type ParagraphProps,
  type TextProps,
} from './model/props';
export {
  HEADER_FOOTER_KINDS,
  HEADER_FOOTER_MARGIN_PT,
  HEADER_FOOTER_SLOTS,
  HeadersAndFooters,
  type HeaderFooter,
  type HeaderFooterKind,
  type HeaderFooterSet,
  type HeaderFooterSetOf,
  type HeaderFooterSlot,
  type ResolvedHeaders,
  type ResolvedHeadersOf,
  type SectionHeaders,
  type SectionHeadersOf,
} from './model/headers';
export {
  COLUMN_GAP_PT,
  Columns,
  MAX_COLUMNS,
  MIN_COLUMN_WIDTH_PT,
  MIN_TEXT_SIDE_PT,
  PAGE_SIDE_MAX_PT,
  PAPER,
  PAPER_ORDER,
  PageSetup,
  type Margins,
  type Orientation,
  type PaperName,
  type LineNumberRestart,
  type LineNumbers,
  type Section,
  type SectionStart,
} from './model/sections';
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
  LOOK_PARAGRAPH_KEYS,
  LOOK_TEXT_KEYS,
  PLAIN_LOOK,
  StyleLooks,
  type StyleLook,
} from './model/style-looks';
export {
  DEFAULT_STYLES_MAX_CHARS,
  DefaultStyles,
  type DefaultStyleLook,
} from './model/default-styles';
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
  FIELD,
  FIELD_ATTRIBUTES,
  FOOTNOTE,
  FOOTNOTE_ATTRIBUTES,
  KEPT_BLOCK,
  KEPT_BLOCK_ATTRIBUTES,
  KEPT_INLINE,
  KEPT_INLINE_ATTRIBUTES,
  PARAGRAPH_ATTRIBUTES,
  RUN_KEPT_MARK,
  RUN_MARKS,
  SECTION_BREAK,
  SECTION_BREAK_ATTRIBUTES,
  TEXT_PROPERTY_MARK_OF,
  TEXT_PROPERTY_MARKS,
  TEXT_STYLE_MARK,
} from './live/live-names';
export { keptBreakOf, keptPresenceOf, type KeptPresence } from './live/kept-presence';
