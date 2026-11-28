// A text document's structure view (docs/specs/034-text-documents/agents-and-sync.md "Reading"): one document tab, a
// line a paragraph (its style, its list and level, ticked or not, its first words), a line a table (its paragraphs,
// rows × columns, its own paragraphs two spaces in), a line an object (picture, drawing, equation, with its alt text or
// linear form), section breaks, contents and kept content; then the tab's comment threads and suggestions by id.
import type { ViewDoor } from '@livedoc/api-schema';
import {
  Equations,
  ParagraphRefs,
  Styles,
  type Block,
  type DocumentTab,
  type Inline,
  type Paragraph,
  type TextDocument,
} from '@livedoc/text-documents';
import { fitLines, fitOf, type ViewLine, type ViewResult } from '../budget';
import { jsonString, plural } from '../text';
import { oneLine, refsText } from './reading';

/** The characters of writing a structure line quotes. */
export const STRUCTURE_QUOTE_CHARS = 40;

type Thread = NonNullable<TextDocument['comments']>[number];

export type StructureCommentJson = {
  id: string;
  paragraph: number;
  quote: string;
  replies: number;
  resolved: boolean;
};

export type StructureSuggestionJson = {
  id: string;
  kind: string;
  paragraph: number;
  text: string;
  author: string | null;
};

export type TextDocumentStructureJson = {
  view: 'structure';
  tab: { id: string; name: string };
  paragraphs: number;
  lines: string[];
  comments: StructureCommentJson[];
  suggestions: StructureSuggestionJson[];
};

const PARAGRAPH = { one: 'paragraph', many: 'paragraphs' };
const TABLE = { one: 'table', many: 'tables' };
const OBJECT = { one: 'object', many: 'objects' };
const COMMENT = { one: 'comment thread', many: 'comment threads' };
const SUGGESTION = { one: 'suggestion', many: 'suggestions' };

type Mark = { id: string; at?: number; author: { name: string } };

const inlineText = (inline: Inline): string =>
  inline.type === 'run' || inline.type === 'field'
    ? inline.text
    : inline.type === 'equation'
      ? Equations.linear(inline.math)
      : inline.type === 'picture'
        ? '[picture]'
        : '';

function objectLine(inline: Inline, number: number): string | null {
  const ref = ParagraphRefs.text(number);
  if (inline.type === 'picture') {
    const kind = inline.drawing === undefined ? 'picture' : 'drawing';
    const alt = inline.decorative
      ? 'decorative'
      : jsonString(inline.alt ?? '', STRUCTURE_QUOTE_CHARS);
    return `${kind} ${ref} ${alt}`;
  }
  if (inline.type === 'equation')
    return `equation ${ref} ${jsonString(Equations.linear(inline.math), STRUCTURE_QUOTE_CHARS)}`;
  return null;
}

type Collected = {
  lines: ViewLine[];
  threads: Map<string, number>;
  // The writing each open thread marks, gathered while its stretch is open.
  stretches: Map<string, { text: string; open: boolean }>;
  suggestions: Map<string, StructureSuggestionJson>;
};

function noteSuggestion(
  into: Collected,
  mark: Mark | undefined,
  kind: string,
  number: number,
  text: string,
) {
  if (!mark) return;
  const known = into.suggestions.get(mark.id);
  if (known) {
    // Enough of it to quote, never all of a long one.
    known.text = (known.text + text).slice(0, STRUCTURE_QUOTE_CHARS * 2);
    return;
  }
  into.suggestions.set(mark.id, {
    id: mark.id,
    kind,
    paragraph: number,
    text,
    author: mark.author.name || null,
  });
}

function paragraphLine(document: TextDocument, paragraph: Paragraph, number: number): string {
  const style = Styles.byId(document.styles, paragraph.style)?.name ?? paragraph.style;
  const list = paragraph.list
    ? ` list ${paragraph.list.id}:${paragraph.list.level}${
        paragraph.list.checked === undefined ? '' : paragraph.list.checked ? ' ✓' : ' ☐'
      }`
    : '';
  const text = oneLine(paragraph);
  return `${ParagraphRefs.text(number)} ${jsonString(style)}${list}${
    text ? ` ${jsonString(text, STRUCTURE_QUOTE_CHARS)}` : ''
  }`;
}

function walk(
  document: TextDocument,
  blocks: readonly Block[],
  numbers: ReadonlyMap<Paragraph, number>,
  indent: string,
  into: Collected,
) {
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const n = numbers.get(block)!;
      into.lines.push({ text: indent + paragraphLine(document, block, n), noun: PARAGRAPH });
      noteSuggestion(into, block.suggested?.break, 'paragraph-break', n, '');
      noteSuggestion(into, block.suggested?.join, 'paragraph-join', n, '');
      noteSuggestion(into, block.suggested?.format, 'paragraph-format', n, '');
      for (const inline of block.inlines) {
        const object = objectLine(inline, n);
        if (object) into.lines.push({ text: `${indent}  ${object}`, noun: OBJECT });
        if (inline.type === 'comment') {
          if (inline.edge === 'start' && !into.threads.has(inline.id))
            into.threads.set(inline.id, n);
          into.stretches.set(inline.id, {
            text: into.stretches.get(inline.id)?.text ?? '',
            open: inline.edge === 'start',
          });
          continue;
        }
        for (const stretch of into.stretches.values())
          if (stretch.open)
            stretch.text = (stretch.text + inlineText(inline)).slice(0, STRUCTURE_QUOTE_CHARS * 2);
        if (inline.type === 'bookmark') continue;
        const s = inline.suggested;
        noteSuggestion(into, s?.insertion, 'insertion', n, inlineText(inline));
        noteSuggestion(into, s?.deletion, 'deletion', n, inlineText(inline));
        if (inline.type === 'run')
          noteSuggestion(into, inline.suggested?.format, 'format', n, inline.text);
      }
    } else if (block.type === 'table') {
      const held = ParagraphRefs.of([block]);
      // Every cell holds a paragraph at least.
      const first = numbers.get(held[0]!)!;
      const last = numbers.get(held.at(-1)!)!;
      const cols = Math.max(
        0,
        ...block.rows.map((r) => r.cells.reduce((k, c) => k + (c.colSpan ?? 1), 0)),
      );
      into.lines.push({
        text: `${indent}table ${refsText(first, last)} ${block.rows.length}×${cols}`,
        noun: TABLE,
      });
      noteSuggestion(into, block.suggested?.insertion, 'table-insertion', first, '');
      noteSuggestion(into, block.suggested?.deletion, 'table-deletion', first, '');
      for (const row of block.rows) {
        const rowFirst = numbers.get(ParagraphRefs.of(row.cells.flatMap((c) => c.blocks))[0]!)!;
        noteSuggestion(into, row.suggested?.insertion, 'row-insertion', rowFirst, '');
        noteSuggestion(into, row.suggested?.deletion, 'row-deletion', rowFirst, '');
        for (const cell of row.cells) walk(document, cell.blocks, numbers, `${indent}  `, into);
      }
    } else if (block.type === 'section') {
      into.lines.push({ text: `${indent}section break (${block.start})` });
    } else if (block.type === 'contents') {
      into.lines.push({
        text: `${indent}contents ${plural(block.entries.length, 'entry', 'entries')}`,
      });
    } else {
      into.lines.push({ text: `${indent}[kept: ${block.name}]` });
    }
  }
}

const threadLine = (c: StructureCommentJson) =>
  `  ${c.id} ${ParagraphRefs.text(c.paragraph)} ${jsonString(
    c.quote,
    STRUCTURE_QUOTE_CHARS,
  )} ${plural(c.replies, 'reply', 'replies')}${c.resolved ? ' resolved' : ''}`;

const suggestionLine = (s: StructureSuggestionJson) =>
  `  ${s.id} ${s.kind} ${ParagraphRefs.text(s.paragraph)}${
    s.text ? ` ${jsonString(s.text, STRUCTURE_QUOTE_CHARS)}` : ''
  }${s.author ? ` by ${jsonString(s.author)}` : ''}`;

export function textDocumentStructureView(
  input: { document: TextDocument; tab: DocumentTab },
  opts: { budget?: number; door?: ViewDoor } = {},
): ViewResult<TextDocumentStructureJson> {
  const { document, tab } = input;
  const numbers = ParagraphRefs.numbers(tab.body);
  const into: Collected = {
    lines: [],
    threads: new Map(),
    stretches: new Map(),
    suggestions: new Map(),
  };
  walk(document, tab.body, numbers, '', into);
  const byId = new Map<string, Thread>((document.comments ?? []).map((t) => [t.id, t]));
  const comments: StructureCommentJson[] = [...into.threads].flatMap(([id, paragraph]) => {
    const thread = byId.get(id);
    if (!thread) return [];
    return [
      {
        id,
        paragraph,
        // The stretch as it read when the thread began, else as it reads now.
        quote: thread.quote || into.stretches.get(id)!.text.replace(/\s+/g, ' ').trim(),
        replies: Math.max(0, thread.comments.length - 1),
        resolved: thread.resolved,
      },
    ];
  });
  const suggestions = [...into.suggestions.values()].map((s) => ({
    ...s,
    text: s.text.replace(/\s+/g, ' ').trim(),
  }));
  const lines: ViewLine[] = [
    ...into.lines,
    { text: comments.length ? 'comments' : 'comments none' },
    ...comments.map((c) => ({ text: threadLine(c), noun: COMMENT })),
    { text: suggestions.length ? 'suggestions' : 'suggestions none' },
    ...suggestions.map((s) => ({ text: suggestionLine(s), noun: SUGGESTION })),
  ];
  const header = `text-document tab ${jsonString(tab.name)} · ${plural(numbers.size, 'paragraph', 'paragraphs')}`;
  const fitted = fitLines({ header, lines, budget: opts.budget, door: opts.door ?? 'cli' });
  return {
    text: fitted.text,
    json: {
      view: 'structure',
      tab: { id: tab.id, name: tab.name },
      paragraphs: numbers.size,
      lines: into.lines.map((l) => l.text),
      comments,
      suggestions,
    },
    fit: fitOf(fitted),
  };
}
