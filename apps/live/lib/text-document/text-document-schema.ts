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
  KEPT_BLOCK,
  KEPT_BLOCK_ATTRIBUTES,
  KEPT_INLINE,
  KEPT_INLINE_ATTRIBUTES,
  keptPresenceOf,
  PARAGRAPH_ATTRIBUTES,
  SECTION_BREAK,
  SECTION_BREAK_ATTRIBUTES,
} from '@livedoc/text-documents';
import { DocumentFonts } from '@livedoc/document';

const nullAttributes = (names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, { default: null }]));

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
  color: propertyMark((v) => (typeof v === 'string' && COLOUR.test(v) ? `color: ${v}` : '')),
  highlight: propertyMark((v) =>
    typeof v === 'string' && COLOUR.test(v) ? `background-color: ${v}` : '',
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
// for what has nothing to see, a line break for a break, else a grey placeholder with its name; selected, copied,
// moved and deleted whole, never edited.
function keptPlaceholder(tag: string, raw: unknown): DOMOutputSpec {
  const name = typeof raw === 'string' ? raw : '';
  const attributes = { contenteditable: 'false', 'data-kept': name };
  switch (keptPresenceOf(name)) {
    case 'hidden':
      return [tag, { ...attributes, class: 'text-document-kept-hidden' }];
    case 'break':
      return ['br', attributes];
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
    parseDOM: [{ tag: 'p' }],
    // Its style by id, which the document's style sheet draws (text-and-paragraphs.md "Paragraph styles").
    toDOM: (node) => {
      const style = (node.attrs as { style: unknown }).style;
      return typeof style === 'string' && style ? ['p', { 'data-style': style }, 0] : ['p', 0];
    },
  },
  [SECTION_BREAK]: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: nullAttributes(SECTION_BREAK_ATTRIBUTES),
    toDOM: () => ['hr', { class: 'text-document-section-break', 'aria-label': 'Section break' }],
  },
  [KEPT_BLOCK]: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: nullAttributes(KEPT_BLOCK_ATTRIBUTES),
    toDOM: (node) => keptPlaceholder('div', (node.attrs as { name: unknown }).name),
  },
  [KEPT_INLINE]: {
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    attrs: nullAttributes(KEPT_INLINE_ATTRIBUTES),
    toDOM: (node) => keptPlaceholder('span', (node.attrs as { name: unknown }).name),
  },
  text: { group: 'inline' },
};

export const textDocumentSchema = new Schema({ nodes, marks });
