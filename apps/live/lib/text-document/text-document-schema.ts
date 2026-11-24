// The text document's ProseMirror schema (docs/specs/034-text-documents/live-editing-and-storage.md "The layout"): a
// node or mark for every element and attribute the live state holds, named as the state names them, so binding the
// editor never drops what it cannot show. Each attribute is a whole value, absent as null.
import {
  Schema,
  type DOMOutputSpec,
  type Mark,
  type MarkSpec,
  type NodeSpec,
} from 'prosemirror-model';
import {
  EQUATION,
  BOOKMARK,
  FIELD,
  FIELD_ATTRIBUTES,
  FOOTNOTE,
  FOOTNOTE_ATTRIBUTES,
  KEPT_BLOCK,
  KEPT_BLOCK_ATTRIBUTES,
  KEPT_INLINE,
  KEPT_INLINE_ATTRIBUTES,
  keptBreakOf,
  keptPresenceOf,
  keptShownText,
  PARAGRAPH_ATTRIBUTES,
  PICTURE,
  SECTION_BREAK,
  CONTENTS,
  SECTION_BREAK_ATTRIBUTES,
} from '@livedoc/text-documents';
import { DocumentFonts } from '@livedoc/document';
import { cssText, paragraphDeclarations, textDeclarations } from './text-document-style-sheet';
import { paperFill, paperInk } from './text-document-paper';
import { tableNodeSpecs } from './text-document-table-dom';
import { pictureNodeSpec } from './text-document-pictures';
import { equationNodeSpec } from './text-document-equations';
import { nullAttributes } from './text-document-attributes';
import { bookmarkNodeSpec } from './text-document-bookmarks';
import { contentsNodeSpec } from './text-document-contents';

const fieldText = (text: unknown): string => (typeof text === 'string' ? text : '');

// A value the model holds as `#rrggbb` (or a highlight's name), checked before it reaches a style attribute.
const COLOUR = /^(#[0-9a-f]{6}|[a-z]+)$/i;
const LINK = /^(https?:|mailto:|#)/i;

const styled = (style: string): DOMOutputSpec => ['span', { style }, 0];
const valueOf = (mark: Mark): unknown => (mark.attrs as { value: unknown }).value;

// One mark per text property, each `{ value }`, so a false that overrides a style is kept and shown.
function propertyMark(css: (value: unknown) => string): MarkSpec {
  return { attrs: { value: {} }, toDOM: (mark) => styled(css(valueOf(mark))) };
}

const marks: Record<string, MarkSpec> = {
  bold: propertyMark((v) => `font-weight: ${v ? 700 : 400}`),
  italic: propertyMark((v) => `font-style: ${v ? 'italic' : 'normal'}`),
  underline: propertyMark((v) => (v ? 'text-decoration-line: underline' : '')),
  strike: propertyMark((v) => (v ? 'text-decoration-line: line-through' : '')),
  vertical: propertyMark((v) =>
    v === 'super' || v === 'sub' ? `vertical-align: ${v}; font-size: 0.7em` : '',
  ),
  // The named family, then its stand-in, then its generic family (fonts.md "Substitution").
  font: propertyMark((v) =>
    typeof v === 'string' ? `font-family: ${DocumentFonts.stack(v)}` : '',
  ),
  size: propertyMark((v) =>
    typeof v === 'number' && v > 0 && v < 1000 ? `font-size: ${v}pt` : '',
  ),
  // Drawn for the page's paper (editing-surface.md "The page in the dark scheme").
  color: propertyMark((v) =>
    typeof v === 'string' && COLOUR.test(v) ? `color: ${paperInk(v)}` : '',
  ),
  highlight: propertyMark((v) =>
    typeof v === 'string' && COLOUR.test(v) ? `background-color: ${paperFill(v)}` : '',
  ),
  small_caps: propertyMark((v) => `font-variant: ${v ? 'small-caps' : 'normal'}`),
  transform: propertyMark((v) =>
    v === 'uppercase' || v === 'lowercase' || v === 'capitalize' ? `text-transform: ${v}` : '',
  ),
  link: {
    attrs: { href: {} },
    inclusive: false,
    toDOM: (mark) => {
      const href = (mark.attrs as { href: unknown }).href;
      return [
        'a',
        typeof href === 'string' && LINK.test(href)
          ? { href, rel: 'noopener noreferrer nofollow', target: '_blank' }
          : {},
        0,
      ];
    },
  },
  // A run's text style and its file's own formatting element: carried, drawn by nothing yet.
  text_style: { attrs: { id: {} }, toDOM: () => ['span', 0] },
  run_kept: { attrs: { kept: {} }, toDOM: () => ['span', 0] },
};

// Something kept from the file, shown as it reads (standard-mapping.md "Kept content", "Shown as it reads"): nothing
// for what has nothing to see, a line break for a break, a content control in a paragraph as its text, else a grey
// placeholder with its name; selected, copied, moved and deleted whole, never edited.
function keptPlaceholder(tag: string, raw: unknown, xml?: unknown): DOMOutputSpec {
  const name = typeof raw === 'string' ? raw : '';
  const attributes = { contenteditable: 'false', 'data-kept': name };
  const kept = xml as { xml?: unknown; ns?: unknown } | null | undefined;
  const source = kept?.xml;
  const shown =
    tag === 'span' && typeof source === 'string' && kept?.ns && typeof kept.ns === 'object'
      ? keptShownText(name, { xml: source, ns: kept.ns as Record<string, string> })
      : null;
  if (shown !== null) return [tag, { ...attributes, class: 'text-document-kept-text' }, shown];
  switch (keptPresenceOf(name)) {
    case 'hidden':
      return [tag, { ...attributes, class: 'text-document-kept-hidden' }];
    case 'break': {
      // A Word page or column break starts a new page or column where pages are laid out (page-layout.md "Breaks").
      const kind = typeof source === 'string' ? keptBreakOf(name, source) : null;
      return [
        'br',
        kind === 'page'
          ? { ...attributes, 'data-page-break': '' }
          : kind === 'column'
            ? { ...attributes, 'data-column-break': '' }
            : attributes,
      ];
    }
    case 'placeholder':
      return [
        tag,
        { ...attributes, class: 'text-document-kept' },
        `${name || 'Content'}, kept from the file`,
      ];
  }
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: {
    group: 'block',
    content: 'inline*',
    attrs: nullAttributes(PARAGRAPH_ATTRIBUTES),
    // Spaces, tabs and line breaks are text (pre-wrap): typing read back from the page keeps them, never collapsed.
    whitespace: 'pre',
    parseDOM: [{ tag: 'p' }],
    // Its style by id, which the document's style sheet draws (text-and-paragraphs.md "Paragraph styles"), and its
    // own paragraph formatting over it ("Alignment and indents").
    toDOM: (node) => {
      const { style, props, text } = node.attrs as {
        style: unknown;
        props: unknown;
        text: unknown;
      };
      // ODF's text formatting the paragraph gives all its characters (standard-mapping.md "The model").
      const own = cssText([
        ...(props && typeof props === 'object' ? paragraphDeclarations(props) : []),
        ...(text && typeof text === 'object' ? textDeclarations(text) : []),
      ]);
      const attrs = {
        ...(typeof style === 'string' && style ? { 'data-style': style } : {}),
        ...(own ? { style: own } : {}),
      };
      return Object.keys(attrs).length > 0 ? ['p', attrs, 0] : ['p', 0];
    },
  },
  [SECTION_BREAK]: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: nullAttributes(SECTION_BREAK_ATTRIBUTES),
    // Drawn with its start's name where breaks are shown (page-layout.md "Breaks").
    toDOM: (node) => {
      const start = (node.attrs as { start: unknown }).start;
      return [
        'hr',
        {
          class: 'text-document-section-break',
          'data-start': typeof start === 'string' ? start : 'next-page',
          'aria-label': 'Section break',
        },
      ];
    },
  },
  [KEPT_BLOCK]: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: nullAttributes(KEPT_BLOCK_ATTRIBUTES),
    toDOM: (node) => keptPlaceholder('div', (node.attrs as { name: unknown }).name),
  },
  // A table (tables.md "In the editor"), its rows and cells.
  ...tableNodeSpecs(),
  // A table of contents (links-and-navigation.md "Table of contents"): read only, its entries paragraphs.
  [CONTENTS]: contentsNodeSpec,
  [KEPT_INLINE]: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: nullAttributes(KEPT_INLINE_ATTRIBUTES),
    toDOM: (node) => {
      const { name, xml } = node.attrs as { name: unknown; xml: unknown };
      return keptPlaceholder('span', name, xml);
    },
  },
  // A picture in line (objects.md "In the editor"), drawn from its media by its node view.
  [PICTURE]: pictureNodeSpec,
  // An equation (objects.md "Equations in the editor"), drawn as MathML.
  [EQUATION]: equationNodeSpec,
  // A bookmark (links-and-navigation.md "Bookmarks"): no width, its ribbon in the left margin.
  [BOOKMARK]: bookmarkNodeSpec,
  // A page number or page count (page-layout.md "Page numbers"): one character to the caret, drawn in its own
  // formatting with the text it last showed; copied as that text.
  [FIELD]: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: nullAttributes(FIELD_ATTRIBUTES),
    leafText: (node) => fieldText(node.attrs.text),
    toDOM: (node) => {
      const { field, text, props } = node.attrs as {
        field: unknown;
        text: unknown;
        props: unknown;
      };
      const own = props && typeof props === 'object' ? cssText(textDeclarations(props)) : '';
      return [
        'span',
        {
          contenteditable: 'false',
          'data-field': typeof field === 'string' ? field : '',
          ...(own ? { style: own } : {}),
        },
        fieldText(text),
      ];
    },
  },
  // A footnote's mark (page-layout.md "Footnotes"): one character to the caret, holding no text, its number drawn by
  // the body's count of marks before it, in superscript, in the mark's own formatting.
  [FOOTNOTE]: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: nullAttributes(FOOTNOTE_ATTRIBUTES),
    leafText: () => '',
    toDOM: (node) => {
      const { story, props } = node.attrs as { story: unknown; props: unknown };
      const own = props && typeof props === 'object' ? cssText(textDeclarations(props)) : '';
      return [
        'sup',
        {
          class: 'text-document-footnote',
          contenteditable: 'false',
          'data-footnote': typeof story === 'string' ? story : '',
          ...(own ? { style: own } : {}),
        },
      ];
    },
  },
  text: { group: 'inline' },
};

export const textDocumentSchema = new Schema({ nodes, marks });
