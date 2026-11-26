// The body's blocks (docs/specs/034-text-documents/standard-mapping.md "The model"): paragraphs of runs and kept
// inlines, tables, section breaks, and kept blocks.
import type { KeptXml } from '@livedoc/office-packages';
import type { ListPlace } from './lists';
import type { KeptProperties, ParagraphProps, TextProps } from './props';
import type { Section } from './sections';
import type { Table } from './tables';
import type { Picture } from './pictures';
import type { Equation } from './equations';
import type { Bookmark } from './bookmarks';
import type { CommentMark } from './comments';
import type { TableOfContents } from './contents';
import type { InlineSuggested, ParagraphSuggested } from './suggestions';

/** Characters with one formatting: tabs as `\t`, line breaks as `\n`. */
export type Run = {
  readonly type: 'run';
  readonly text: string;
  /** A text style by id, under the direct formatting. */
  readonly style?: string;
  readonly props: TextProps;
  /** `http(s):`, `mailto:` or `#bookmark`. */
  readonly link?: string;
  readonly kept?: KeptProperties;
  /** The suggestions it is part of (review.md "How a suggestion is kept"). */
  readonly suggested?: InlineSuggested;
};

/** Something inside a paragraph the model does not map (a hidden bookmark, another field, an endnote, a picture), kept as the file has it. */
export type KeptInline = {
  readonly type: 'kept';
  /** What it is, for the placeholder and the reports: the element's local name. */
  readonly name: string;
  readonly xml: KeptXml;
  /** The formatting of the run it sat in (ODF writes it around the kept element; OOXML's element holds its own). */
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
  /** The suggestions it is part of (review.md "How a suggestion is kept"). */
  readonly suggested?: InlineSuggested;
};

/** What a field shows (page-layout.md "Page numbers"): the page it is drawn on, or how many pages there are. */
export type FieldKind = 'page-number' | 'page-count';
export const FIELD_KINDS: readonly FieldKind[] = ['page-number', 'page-count'];

/** A field: characters the document works out, with the formatting of a run and the text last drawn. */
export type Field = {
  readonly type: 'field';
  readonly field: FieldKind;
  /** The text it showed when it was written (a file's cached result). */
  readonly text: string;
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
  /** The suggestions it is part of (review.md "How a suggestion is kept"). */
  readonly suggested?: InlineSuggested;
};

/**
 * A footnote (page-layout.md "Footnotes"): its mark, one character in the text with the formatting of the run it sits
 * in, holding the note's own writing. Its number is its place among the body's notes (`Notes.numbers`), never held.
 */
export type Note = {
  readonly type: 'note';
  readonly blocks: readonly Block[];
  readonly props: TextProps;
  readonly style?: string;
  readonly link?: string;
  readonly kept?: KeptProperties;
  /** The suggestions it is part of (review.md "How a suggestion is kept"). */
  readonly suggested?: InlineSuggested;
};

export type Inline = Run | Field | Note | Picture | Equation | Bookmark | CommentMark | KeptInline;

export type Paragraph = {
  readonly type: 'paragraph';
  /** The paragraph style's id. */
  readonly style: string;
  readonly props: ParagraphProps;
  readonly list?: ListPlace;
  /** ODF: text formatting the paragraph gives all its characters (its automatic style's text properties). */
  readonly text?: TextProps;
  readonly inlines: readonly Inline[];
  readonly kept?: KeptProperties;
  /** Its break, join and paragraph format suggestions (review.md "How a suggestion is kept"). */
  readonly suggested?: ParagraphSuggested;
};

/** Starts a section: everything after it, to the next break, has its setup. */
export type SectionBreak = {
  readonly type: 'section';
  /** ODF: a continuous section that came as a `text:section`, its start tag kept. */
  readonly region?: KeptXml;
} & Section;

/** A body-level element the model does not map (a table of contents, a table past the limits). */
export type KeptBlock = { readonly type: 'kept'; readonly name: string; readonly xml: KeptXml };

export type Block = Paragraph | Table | SectionBreak | TableOfContents | KeptBlock;

export const Paragraph = {
  of: (text: string, style: string): Paragraph => ({
    type: 'paragraph',
    style,
    props: {},
    inlines: text ? [{ type: 'run', text, props: {} }] : [],
  }),
  /** The paragraph's own characters, a field's as it last showed; notes' marks, objects and kept inlines read as nothing. */
  text: (paragraph: Paragraph): string =>
    paragraph.inlines.map((i) => (i.type === 'run' || i.type === 'field' ? i.text : '')).join(''),
} as const;
