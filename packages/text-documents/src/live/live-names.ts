// The names the model lies under in the live state (docs/specs/034-text-documents/live-editing-and-storage.md "The
// layout"). The editor's schema has a node or mark for each, so binding it drops nothing.
import type { TextProps } from '../model/props';

/** The body's elements: a block each. */
export const PARAGRAPH = 'paragraph';
export const SECTION_BREAK = 'section_break';
export const KEPT_BLOCK = 'kept_block';
export const BODY_BLOCKS = [PARAGRAPH, SECTION_BREAK, KEPT_BLOCK] as const;

/** A kept inline: an atom inside its paragraph. */
export const KEPT_INLINE = 'kept_inline';

/** The attributes each element holds, each a whole value. */
export const PARAGRAPH_ATTRIBUTES = ['style', 'props', 'list', 'text', 'kept'] as const;
export const SECTION_BREAK_ATTRIBUTES = ['start', 'setup', 'kept', 'region'] as const;
export const KEPT_BLOCK_ATTRIBUTES = ['name', 'xml'] as const;
export const KEPT_INLINE_ATTRIBUTES = ['name', 'xml', 'props', 'style', 'link', 'kept'] as const;

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

/** The root maps beside the body. */
export const DOCUMENT_MAP = 'document';
export const STYLES_MAP = 'styles';
export const LISTS_MAP = 'lists';
export const SOURCE_MAP = 'source';
