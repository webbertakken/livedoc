// The names the model lies under in the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The
// layout"). The editor's schema has a node or mark for each, so binding it drops nothing.
import type { TextProps } from '../model/props';

/** The body's elements: a block each. */
export const PARAGRAPH = 'paragraph';
export const SECTION_BREAK = 'section_break';
export const KEPT_BLOCK = 'kept_block';
/** A table (tables.md "In the editor"): rows of cells, a header row's cells header cells, each cell holding blocks. */
export const TABLE = 'table';
export const TABLE_ROW = 'table_row';
export const TABLE_CELL = 'table_cell';
export const TABLE_HEADER = 'table_header';
/** A table of contents (links-and-navigation.md "Table of contents"): its look and levels, its entries paragraphs. */
export const CONTENTS = 'table_of_contents';
export const BODY_BLOCKS = [PARAGRAPH, SECTION_BREAK, KEPT_BLOCK, TABLE, CONTENTS] as const;
/** The elements inside a table. */
export const TABLE_PARTS = [TABLE_ROW, TABLE_CELL, TABLE_HEADER] as const;

/** A kept inline: an atom inside its paragraph. */
export const KEPT_INLINE = 'kept_inline';
/** A field (page-layout.md "Page numbers"): an atom inside its paragraph. */
export const FIELD = 'field';
/** A footnote's mark (page-layout.md "Footnotes"): an atom inside its paragraph, naming its note's fragment. */
export const FOOTNOTE = 'footnote';

/** The attributes each element holds, each a whole value. */
export const PARAGRAPH_ATTRIBUTES = [
  'style',
  'props',
  'list',
  'text',
  'kept',
  // Its break, join and paragraph format suggestions (review.md "How a suggestion is kept").
  'insertion',
  'deletion',
  'formatChange',
] as const;
export const SECTION_BREAK_ATTRIBUTES = [
  'start',
  'setup',
  'headers',
  'numberStart',
  'lineNumbers',
  'kept',
  'region',
  // Its insertion or deletion, whole (review.md "How a suggestion is kept").
  'insertion',
  'deletion',
] as const;
/**
 * A kept block's name and XML. `table`: a table held whole as the model's value, as documents imported before the
 * editor drew tables hold one; read as that table, never written.
 */
export const CONTENTS_ATTRIBUTES = ['look', 'levels', 'insertion', 'deletion'] as const;
export const KEPT_BLOCK_ATTRIBUTES = ['name', 'xml', 'table'] as const;
export const TABLE_ATTRIBUTES = [
  'align',
  'indent',
  'kept',
  'tag',
  'insertion',
  'deletion',
] as const;
/** A row's height, whether it breaks, what its file kept, and its insertion or deletion whole. */
export const TABLE_ROW_ATTRIBUTES = [
  'height',
  'heightRule',
  'breaks',
  'kept',
  'tag',
  'insertion',
  'deletion',
] as const;
/**
 * A cell's spans, its spanned columns' widths in points, its formatting, what its file kept, and its insertion or
 * deletion whole (a column's).
 */
export const TABLE_CELL_ATTRIBUTES = [
  'colspan',
  'rowspan',
  'colwidth',
  'props',
  'kept',
  'tag',
  'insertion',
  'deletion',
] as const;
/** A picture in line (objects.md "In the editor"): an atom inside its paragraph, its media by key. */
export const PICTURE = 'picture';
export const PICTURE_ATTRIBUTES = [
  'media',
  'width',
  'height',
  'alt',
  'title',
  'decorative',
  'crop',
  'rotation',
  'recolour',
  'transparency',
  'brightness',
  'contrast',
  'placement',
  'props',
  'style',
  'link',
  'drawing',
  'kept',
  'insertion',
  'deletion',
] as const;
/** An equation (objects.md "Equations in the editor"): an atom inside its paragraph, its maths one whole value. */
export const EQUATION = 'equation';
export const EQUATION_ATTRIBUTES = [
  'math',
  'props',
  'style',
  'link',
  'kept',
  'insertion',
  'deletion',
] as const;
/** A bookmark (links-and-navigation.md "Bookmarks"): an atom of no width inside its paragraph, by its name. */
export const BOOKMARK = 'bookmark';
export const BOOKMARK_ATTRIBUTES = [
  'name',
  'props',
  'style',
  'link',
  'kept',
  'insertion',
  'deletion',
] as const;
export const KEPT_INLINE_ATTRIBUTES = [
  'name',
  'xml',
  'props',
  'style',
  'link',
  'kept',
  'insertion',
  'deletion',
] as const;
export const FIELD_ATTRIBUTES = [
  'field',
  'text',
  'props',
  'style',
  'link',
  'kept',
  'insertion',
  'deletion',
] as const;
export const FOOTNOTE_ATTRIBUTES = [
  'story',
  'props',
  'style',
  'link',
  'kept',
  'insertion',
  'deletion',
] as const;

/** One text formatting attribute per text property, each holding `{ value }`. */
export const TEXT_PROPERTY_MARK_OF = {
  font: 'font',
  size: 'size',
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
  vertical: 'vertical',
  color: 'color',
  highlight: 'highlight',
  smallCaps: 'small_caps',
  transform: 'transform',
} as const satisfies Record<keyof Required<TextProps>, string>;
export const TEXT_PROPERTY_MARKS = Object.values(TEXT_PROPERTY_MARK_OF);

/** A run's link (`{ href }`), text style (`{ id }`) and kept formatting element (`{ kept }`). */
export const LINK_MARK = 'link';
export const TEXT_STYLE_MARK = 'text_style';
export const RUN_KEPT_MARK = 'run_kept';

/** Every text formatting attribute a run may carry. */
export const RUN_MARKS = [
  ...TEXT_PROPERTY_MARKS,
  LINK_MARK,
  TEXT_STYLE_MARK,
  RUN_KEPT_MARK,
] as const;

/**
 * A suggestion's marks (review.md "How a suggestion is kept"): on text, each a formatting attribute excluding itself;
 * `insertion` and `deletion` also on an object in a line, a paragraph (its break, its join) and a block, and
 * `formatChange` on a paragraph (its paragraph format).
 */
export const INSERTION_MARK = 'insertion';
export const DELETION_MARK = 'deletion';
export const FORMAT_CHANGE_MARK = 'format_change';
export const SUGGESTION_MARKS = [INSERTION_MARK, DELETION_MARK, FORMAT_CHANGE_MARK] as const;
export const PARAGRAPH_FORMAT_CHANGE = 'formatChange';

/** The root maps beside the body. */
export const DOCUMENT_MAP = 'document';
export const STYLES_MAP = 'styles';
export const LISTS_MAP = 'lists';
export const SOURCE_MAP = 'source';
/** The pictures' media by key, each `{ mediaType, bytes, part }` (live-editing-and-storage.md "The layout"). */
export const MEDIA_MAP = 'media';
/** The document tabs by id, each `{ name, emoji, depth, order }` (live-editing-and-storage.md "The layout"). */
export const TABS_MAP = 'tabs';
/** The comment threads by id, beside the writing (review.md "How a comment is kept"). */
export const THREADS_MAP = 'threads';
