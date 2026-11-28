// What every view of a text document reads of it (docs/specs/034-text-documents/agents-and-sync.md "Reading"): its
// document tabs, the one a view reads (`only`, by id or name; the first by default), its paragraphs by number and its
// headings, as the editor's outline finds them.
import {
  DocumentTabs,
  ParagraphRefs,
  Styles,
  type Paragraph,
  type DocumentTab,
  type TextDocument,
} from '@livedoc/text-documents';

/** The deepest heading the outline lists (links-and-navigation.md "The outline"). */
export const TEXT_DOCUMENT_HEADING_MAX = 6;
/** What an empty heading reads, as the editor's outline shows it. */
export const UNTITLED_HEADING = 'Untitled heading';
/** Asked of a tab that is no text document: `text` and `structure` read a text document's writing. */
export const TEXT_VIEW_NOT_TEXT_DOCUMENT = 'reads a text document; this tab is none';
/** Asked of a text document: the element views read a canvas tab. */
export const ELEMENT_VIEW_ON_TEXT_DOCUMENT =
  'reads a canvas tab; a text document reads outline, text or structure';
/** What a view says of the document tab `only` names when the document has none of that id or name. */
export const NO_SUCH_DOCUMENT_TAB =
  'only names a document tab of this text document, by its id or name';

/** The file format a text document is in, as its header names it. */
export const formatName = (document: TextDocument): 'odt' | 'docx' =>
  document.format === 'ooxml' ? 'docx' : 'odt';

export type Heading = {
  readonly number: number;
  readonly level: number;
  readonly text: string;
  // The paragraphs under it, to the next heading of its level or above.
  readonly paragraphs: number;
};

/** A paragraph's heading level from its own outline level or its style's, 1 to 6; null for none. */
export function headingLevel(document: TextDocument, paragraph: Paragraph): number | null {
  const level =
    paragraph.props.outlineLevel ?? Styles.outlineLevel(document.styles, paragraph.style);
  return level !== undefined && level >= 1 && level <= TEXT_DOCUMENT_HEADING_MAX ? level : null;
}

/** The text of a paragraph on one line: runs and fields as written, line breaks and tabs as spaces. */
export const oneLine = (paragraph: Paragraph): string =>
  paragraph.inlines
    .map((i) => (i.type === 'run' || i.type === 'field' ? i.text : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

/** A document tab's headings: its body's own paragraphs (never a table's) with a heading level, in order. */
export function headingsOf(document: TextDocument, tab: DocumentTab): Heading[] {
  const numbers = ParagraphRefs.numbers(tab.body);
  const count = numbers.size;
  const found = tab.body.flatMap((block) => {
    if (block.type !== 'paragraph') return [];
    const level = headingLevel(document, block);
    return level === null
      ? []
      : [{ number: numbers.get(block)!, level, text: oneLine(block) || UNTITLED_HEADING }];
  });
  return found.map((heading, i) => {
    const next = found.slice(i + 1).find((h) => h.level <= heading.level);
    return { ...heading, paragraphs: (next?.number ?? count + 1) - heading.number - 1 };
  });
}

/** The document tab `only` names, by id first, then by name (any case); the first without it; null for none. */
export function documentTabOf(
  document: TextDocument,
  only: string | undefined,
): DocumentTab | null {
  const tabs = DocumentTabs.all(document);
  if (only === undefined) return tabs[0]!;
  const named = only.toLowerCase();
  return (
    tabs.find((t) => t.id === only) ?? tabs.find((t) => t.name.toLowerCase() === named) ?? null
  );
}

/** Whether a document tab holds nothing: no paragraph with text or an object, no table or other block. */
export const isEmptyTab = (tab: DocumentTab): boolean =>
  tab.body.every(
    (block) =>
      block.type === 'section' ||
      (block.type === 'paragraph' &&
        block.inlines.every((i) => (i.type === 'run' || i.type === 'field') && i.text === '')),
  );

export type ParagraphRange = { from: number; to: number };

/** `40..60` or `12`, within `1..count`; a message naming the bounds otherwise. */
export function parseParagraphRange(
  text: string,
  count: number,
): { ok: true; range: ParagraphRange } | { ok: false; message: string } {
  const match = /^\s*(\d+)\s*(?:\.\.\s*(\d+)\s*)?$/.exec(text);
  const from = match ? Number(match[1]) : NaN;
  const to = match?.[2] === undefined ? from : Number(match[2]);
  if (!match || from < 1 || to < from || to > count)
    return {
      ok: false,
      message:
        count === 0
          ? 'range has no paragraphs to read: this document tab is empty'
          : `range takes paragraph numbers from 1 to ${count}, like 1..${count} or one number: "${text}"`,
    };
  return { ok: true, range: { from, to } };
}

/** `¶7`, or `¶7..¶9`. */
export const refsText = (from: number, to: number): string =>
  from === to ? ParagraphRefs.text(from) : `${ParagraphRefs.text(from)}..${ParagraphRefs.text(to)}`;

export const rangeText = ({ from, to }: ParagraphRange): string =>
  from === to ? String(from) : `${from}..${to}`;
