// A text document's text view (docs/specs/034-text-documents/agents-and-sync.md "Reading"): one document tab's writing
// as its Markdown download writes it, pending suggestions in CriticMarkup, `¶<n> ` before each paragraph with `lines`
// (a table's row before it the numbers of the paragraphs it holds), whole or a range of paragraph numbers. Kept
// content reads `[kept: <name>]`. A budget drops whole paragraphs from the end and names the range left out, and how
// to read it.
import type { ViewDoor } from '@livedoc/api-schema';
import {
  ParagraphRefs,
  tabMarkdown,
  type DocumentTab,
  type MarkdownPiece,
  type TextDocument,
} from '@livedoc/text-documents';
import { estimateTokens, type ViewResult } from '../budget';
import { elisionCommand } from '../elision';
import { ELLIPSIS, jsonString, plural } from '../text';
import { parseParagraphRange, rangeText, type ParagraphRange } from './reading';

export type TextDocumentTextJson = {
  view: 'text';
  tab: { id: string; name: string };
  paragraphs: number;
  range: string | null;
  markdown: string;
  // The paragraphs a budget left out, to read on with; null when nothing was.
  next: string | null;
};

export type TextDocumentTextResult =
  | ({ ok: true } & ViewResult<TextDocumentTextJson>)
  | { ok: false; message: string };

// A group of lines read or left out whole, apart from the one before by an empty line unless both are tight. A
// table's later rows are glued to the row above. `last` is the last paragraph it shows, 0 for none of its own.
type Unit = { text: string; tight: boolean; glued: boolean; last: number };

// `¶7` or `¶7..¶9`.
const refsText = (from: number, to: number) =>
  from === to ? ParagraphRefs.text(from) : `${ParagraphRefs.text(from)}..${ParagraphRefs.text(to)}`;

const unit = (text: string, tight: boolean, last: number, glued = false): Unit => ({
  text,
  tight,
  glued,
  last,
});

function paragraphUnits(piece: Extract<MarkdownPiece, { kind: 'paragraph' }>, lines: boolean): Unit[] {
  if (!lines) return piece.text ? [unit(piece.text, piece.tight, piece.number)] : [];
  const ref = ParagraphRefs.text(piece.number);
  return [unit(piece.text ? `${ref} ${piece.text}` : ref, piece.tight || !piece.text, piece.number)];
}

function tableUnits(
  piece: Extract<MarkdownPiece, { kind: 'table' }>,
  inRange: (n: number) => boolean,
  lines: boolean,
): Unit[] {
  // Every row holds a paragraph: each cell holds one at least.
  const rows = piece.rows.filter((row) => inRange(row.first) || inRange(row.first + row.count - 1));
  return rows.map((row, i) => {
    const last = row.first + row.count - 1;
    const text = lines ? `${refsText(row.first, last)} ${row.text}` : row.text;
    return unit(i === 0 ? `${text}\n${piece.rule}` : text, false, last, i > 0);
  });
}

function unitsOf(
  pieces: readonly MarkdownPiece[],
  inRange: (n: number) => boolean,
  lines: boolean,
): Unit[] {
  // A piece without a number of its own (contents, kept content) goes with the paragraph after it.
  let seen = 0;
  return pieces.flatMap((piece): Unit[] => {
    if (piece.kind === 'paragraph') {
      seen = piece.number;
      return inRange(piece.number) ? paragraphUnits(piece, lines) : [];
    }
    if (piece.kind === 'table') {
      const units = tableUnits(piece, inRange, lines);
      const lastRow = piece.rows.at(-1)!;
      seen = lastRow.first + lastRow.count - 1;
      return units;
    }
    if (!inRange(seen + 1)) return [];
    return piece.kind === 'contents'
      ? [unit(piece.text, true, 0)]
      : [unit(`[kept: ${piece.name}]`, false, 0)];
  });
}

const joinUnits = (units: readonly Unit[]): string =>
  units.reduce(
    (out, u, i) =>
      i === 0 ? u.text : `${out}${u.glued || (units[i - 1]!.tight && u.tight) ? '\n' : '\n\n'}${u.text}`,
    '',
  );

// `… ¶201..¶340 left out: view --view text --range 201..340`
function closingLine(
  next: ParagraphRange,
  lines: boolean,
  opts: { door?: ViewDoor; only?: string },
): string {
  const args = {
    view: 'text',
    ...(opts.only === undefined ? {} : { only: opts.only }),
    range: rangeText(next),
    ...(lines ? { lines: true } : {}),
  };
  return `${ELLIPSIS} ${refsText(next.from, next.to)} left out: ${elisionCommand(args, opts.door ?? 'cli')}`;
}

export function textDocumentTextView(
  input: { document: TextDocument; tab: DocumentTab; range?: string; lines?: boolean },
  opts: { budget?: number; door?: ViewDoor; only?: string } = {},
): TextDocumentTextResult {
  const { document, tab, lines = false } = input;
  const read = tabMarkdown(document, tab.id)!;
  const count = ParagraphRefs.of(tab.body).length;
  let range: ParagraphRange = { from: 1, to: count };
  if (input.range !== undefined) {
    const parsed = parseParagraphRange(input.range, count);
    if (!parsed.ok) return { ok: false, message: parsed.message };
    range = parsed.range;
  }
  const inRange = (n: number) => n >= range.from && n <= range.to;
  // The footnotes of the paragraphs read close the view, one after another.
  const units = [
    ...unitsOf(read.pieces, inRange, lines),
    ...read.notes
      .filter((note) => inRange(note.paragraph))
      .map((note, i) => unit(note.text, true, 0, i > 0)),
  ];
  const header = [
    `text-document tab ${jsonString(tab.name)}`,
    plural(count, 'paragraph', 'paragraphs'),
    ...(input.range === undefined ? [] : [refsText(range.from, range.to)]),
  ].join(' · ');
  const whole = joinUnits(units);
  const fullTokens = estimateTokens(header.length + 1 + whole.length);
  // Whole units from the start while they and the closing line fit; what is left out is read on from the paragraph
  // after the last one shown (the last one again when only its footnotes were left out).
  let kept = units.length;
  let next: ParagraphRange | null = null;
  const nextAfter = (shown: readonly Unit[]): ParagraphRange => {
    const last = Math.max(range.from - 1, ...shown.map((u) => u.last));
    return { from: Math.min(last + 1, range.to), to: range.to };
  };
  if (opts.budget !== undefined && fullTokens > opts.budget) {
    kept = 0;
    while (kept < units.length) {
      const shown = units.slice(0, kept + 1);
      const closing = closingLine(nextAfter(shown), lines, opts);
      const length = header.length + 1 + joinUnits(shown).length + 1 + closing.length;
      if (estimateTokens(length) > opts.budget) break;
      kept++;
    }
    next = nextAfter(units.slice(0, kept));
  }
  const shown = joinUnits(units.slice(0, kept));
  const text = [header, shown, next ? closingLine(next, lines, opts) : '']
    .filter((line) => line !== '')
    .join('\n');
  return {
    ok: true,
    text,
    json: {
      view: 'text',
      tab: { id: tab.id, name: tab.name },
      paragraphs: count,
      range: input.range === undefined ? null : rangeText(range),
      markdown: shown,
      next: next ? rangeText(next) : null,
    },
    fit: { estimate: fullTokens, state: next ? 'lines-dropped' : 'full' },
  };
}
