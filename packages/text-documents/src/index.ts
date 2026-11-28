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
  TEXT_DOCUMENT_MAX_OBJECTS,
  TEXT_DOCUMENT_MAX_STATE_BYTES,
  TEXT_DOCUMENT_UNDO_GROUP_MS,
  TEXT_DOCUMENT_UPDATE_MAX_BYTES,
  TEXT_DOCUMENT_WORDS_PER_PAGE,
  TEXT_DOCUMENT_VERSION_EVERY_MS,
  TEXT_DOCUMENT_VERSION_EVERY_UPDATES,
  TEXT_DOCUMENT_VERSION_KEEP_ALL_DAYS,
  TEXT_DOCUMENT_AUTO_VERSIONS_MAX,
  TEXT_DOCUMENT_VERSIONS_MAX_BYTES,
  TEXT_DOCUMENT_NOTICE_CHANGE_CHARS,
  TEXT_DOCUMENT_NOTICE_EMAILS_PER_HOUR,
  TEXT_DOCUMENT_NOTICE_EXCERPTS_MAX,
  TEXT_DOCUMENT_NOTICE_QUOTE_CHARS,
  TEXT_DOCUMENT_NOTICE_WINDOW_MS,
  TEXT_DOCUMENT_NAMED_VERSIONS_MAX,
  TEXT_DOCUMENT_VERSION_NAME_MAX_CHARS,
  VIEWER_COPY_APPLY_BUDGET_MS,
  VIEWER_COPY_BUILD_BUDGET_MS,
  VIEWER_COPY_SOURCE_MAX_BYTES,
  VIEWER_COPY_LOG_UPDATES,
  VIEWER_COPY_STATE_MAX_BYTES,
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
  EXPORT_EXTENSIONS,
  PICTURED_EXPORT_TYPES,
  TEXT_DOCUMENT_EXPORT_TYPES,
  TEXT_DOCUMENT_FILE_TYPES,
  TEXT_DOCUMENT_IMPORT_TYPES,
  importTypeOfFileName,
  isTextDocumentImportType,
  type TextDocumentImportType,
  isPicturedExportType,
  isTextDocumentExportType,
  isTextDocumentFileType,
  type TextDocumentDownloadType,
  type PicturedExportType,
  type TextDocumentExportType,
  type TextDocumentFileType,
} from './file-types';
export {
  EXPORT_MEDIA_TYPES,
  settledDocument,
  writeTextDocumentExport,
  type ExportOptions,
} from './exports/text-document-exports';
export { writeEpub } from './exports/epub';
export { writeRtf } from './exports/rtf';
export { webPageHtml, writeWebPage } from './exports/web-page';
export { writeMarkdown, escapeMarkdown } from './exports/markdown';
export { writePlainText } from './exports/plain-text';
export { base64OfBytes, bytesOfBase64 } from '@livedoc/office-packages';
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
  BOOKMARK_NAME_LENGTH,
  BOOKMARK_NAME_MAX,
  HIDDEN_BOOKMARK_PREFIX,
  Bookmarks,
  type Bookmark,
} from './model/bookmarks';
export {
  childRowKeys,
  childRows,
  Equations,
  mathRowId,
  withChildRow,
  type Equation,
  type MathNode,
  type MathRow,
  type MathStep,
  type MathTokenKind,
} from './model/equations';
export {
  EQUATION_FUNCTIONS,
  EQUATION_MENU_LABELS,
  EQUATION_MENUS,
  EQUATION_STRUCTURE_MENU,
  EQUATION_SYMBOLS,
  equationShortcut,
  type EquationMenu,
  type EquationStructure,
  type EquationSymbol,
} from './model/equation-symbols';
export { EquationEditing, type MathCaret, type MathEdit } from './model/equation-editing';
export { MATHML_NS, mathMlTree, mathMlXml, type MathMlElement } from './model/equation-mathml';
export {
  Pictures,
  type DocumentMedia,
  type Picture,
  type PictureCrop,
  type GalleryPictureMedia,
  type HeldPictureMedia,
  type PictureMedia,
} from './model/pictures';
export { DrawingPictures } from './model/drawing-pictures';
export {
  PICTURE_ADJUSTMENT_RANGES,
  PICTURE_ADJUSTMENTS,
  PICTURE_CONTRAST_MAX_SLOPE,
  PICTURE_LUMA,
  PictureColours,
  type PictureAdjustment,
  type PictureColouring,
  type PictureRecolour,
} from './model/picture-colours';
export {
  PICTURE_MARGIN_MAX,
  PICTURE_OFFSET_MAX,
  PICTURE_WRAP_MARGIN,
  PICTURE_WRAPS,
  PicturePlacements,
  type PictureMargin,
  type PictureMoves,
  type PicturePlacement,
  type PictureWrap,
} from './model/picture-placement';
export {
  Blocks,
  CELL_SIDES,
  TABLE_COLUMN_FALLBACK_PT,
  Tables,
  TEXT_DOCUMENT_TABLE_MAX_COLUMNS,
  TEXT_DOCUMENT_TABLE_MAX_ROWS,
  type CellBorders,
  type CellPadding,
  type CellProps,
  type CellSide,
  type CellVerticalAlign,
  type GridPlace,
  type Table,
  type TableAlign,
  type TableCell,
  type TableRepair,
  type TableRow,
} from './model/tables';
export {
  WATERMARK_DEFAULTS,
  watermarkBox,
  Watermarks,
  type TextWatermark,
  type Watermark,
  type WatermarkLayout,
} from './model/watermark';
export { Summary, TEXT_DOCUMENT_SUMMARY_MAX } from './model/summary';
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
  CODE_BLOCK_FONT,
  CODE_BLOCK_LANGUAGES,
  CODE_BLOCK_SHADING,
  CODE_STYLE_NAME,
  CodeBlocks,
  type CodeBlockLanguage,
} from './model/code-blocks';
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
export {
  CONVERSION_LINES,
  CONVERSION_NAMES_SHOWN,
  conversionLead,
  conversionLines,
  conversionTitle,
  formatName,
  type ConversionPurpose,
} from './conversion-copy';
export { isSafeLink, type DroppedReason, type ImportReport, type ReportItem } from './report';
export {
  BODY_BLOCKS,
  FIELD,
  FIELD_ATTRIBUTES,
  FOOTNOTE,
  FOOTNOTE_ATTRIBUTES,
  KEPT_BLOCK,
  KEPT_BLOCK_ATTRIBUTES,
  CONTENTS,
  CONTENTS_ATTRIBUTES,
  TABLE,
  TABLE_ATTRIBUTES,
  TABLE_CELL,
  TABLE_CELL_ATTRIBUTES,
  TABLE_HEADER,
  TABLE_PARTS,
  TABLE_ROW,
  TABLE_ROW_ATTRIBUTES,
  EQUATION,
  EQUATION_ATTRIBUTES,
  BOOKMARK,
  BOOKMARK_ATTRIBUTES,
  KEPT_INLINE,
  KEPT_INLINE_ATTRIBUTES,
  MEDIA_MAP,
  PARAGRAPH_ATTRIBUTES,
  PICTURE,
  PICTURE_ATTRIBUTES,
  RUN_KEPT_MARK,
  RUN_MARKS,
  SECTION_BREAK,
  SECTION_BREAK_ATTRIBUTES,
  TEXT_PROPERTY_MARK_OF,
  TEXT_PROPERTY_MARKS,
  TEXT_STYLE_MARK,
} from './live/live-names';
export {
  keptBreakOf,
  keptPresenceOf,
  keptShownText,
  type KeptPresence,
} from './live/kept-presence';
export {
  CONTENTS_INDENT_PT,
  CONTENTS_LEVELS_MAX,
  Contents,
  type ContentsLook,
  type TableOfContents,
} from './model/contents';
export {
  DOCUMENT_TAB_EMOJI_MAX,
  DocumentTabs,
  FIRST_DOCUMENT_TAB_ID,
  TEXT_DOCUMENT_MAX_TABS,
  TEXT_DOCUMENT_TAB_DEPTH,
  TEXT_DOCUMENT_TAB_NAME_MAX,
  type DocumentTab,
  type DocumentTabDepth,
  type DocumentTabHead,
} from './model/document-tabs';
export { TAB_FRAGMENT_PREFIX, tabFragment, tabFragmentName } from './live/live-root';
export { TABS_MAP } from './live/live-names';
export {
  LiveThreads,
  TEXT_DOCUMENT_COMMENT_TEXT_MAX,
  TEXT_DOCUMENT_THREAD_COMMENTS_MAX,
  TEXT_DOCUMENT_REACTIONS_MAX,
  REACTION_EMOJI_MAX,
  TEXT_DOCUMENT_THREADS_MAX,
  THREADS_MAP,
  type TextDocumentComment,
  type TextDocumentCommentAuthor,
  type TextDocumentThread,
  type TextDocumentThreadAnchor,
  type TextDocumentThreadStart,
} from './live/live-threads';
export {
  INBOX_QUOTE_MAX,
  drawnMentions,
  textDocumentCollabRows,
  threadAssignment,
  threadLabel,
} from './live/live-thread-index';
export {
  DELETION_MARK,
  DRAWING_ELEMENT,
  FORMAT_CHANGE_MARK,
  INSERTION_MARK,
  isSuggestionMark,
  isWellFormedMark,
  LiveSuggestions,
  PARAGRAPH_FORMAT_CHANGE,
  SUGGESTION_AUTHOR_NAME_MAX,
  SUGGESTION_ID_MAX,
  SUGGESTION_MARKS,
  suggestedBreakKind,
  TEXT_DOCUMENT_SUGGESTIONS_MAX,
  type FormatChangeMark,
  type ParagraphFormatChangeMark,
  type SuggestedBreakKind,
  type SuggestionMark,
  type SuggestionPart,
  type SuggestionPartKind,
  type TextDocumentSuggestion,
} from './live/live-suggestions';
export { textDocumentLevelAsked, type TextDocumentLevelAsked } from './level-asked';
export {
  addLiveTab,
  copyLiveTabBody,
  liveTabIds,
  liveTabList,
  setLiveTabList,
  type LiveTab,
} from './live/live-tabs';
export {
  DocumentTabList,
  type DocumentTabDropPlace,
  type DocumentTabEntry,
} from './model/document-tab-list';
export {
  TEXT_DOCUMENT_COMPARE_BUDGET_MS,
  TEXT_DOCUMENT_COMPARE_TOKENS_MAX,
  TextDocumentComparison,
  type ComparisonOptions,
  type ComparisonRefusal,
  type ComparisonResult,
} from './compare/compare-documents';
export { VersionSnapshots } from './versions/version-snapshots';
export { restoreUpdate, versionDocument } from './versions/version-restore';
export {
  NoticeChanges,
  type NoticeBaseline,
  type NoticeChange,
  type NoticeChangeAuthors,
} from './notices/notice-changes';
export {
  anonymousAuthor,
  ViewerCopy,
  VIEWER_AUTHOR_COLOUR,
  VIEWER_AUTHOR_KEY_PREFIX,
  VIEWER_AUTHOR_NAME,
} from './viewer/viewer-copy';
export { syncWriting } from './live/writing-sync';
export { SettledWriting } from './live/settled-writing';
export {
  looksLikeMarkdown,
  markdownInline,
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownRun,
} from './imports/markdown-blocks';
export { readTextDocumentImport } from './imports/import-file';
