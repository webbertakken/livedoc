// What screen reader support says (docs/specs/034-text-documents/tools.md "Accessibility settings", What each says):
// each verbalise command reads the editor's state into one sentence for the surface's live region, never empty.
import type { Node as PmNode, ResolvedPos } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { cellAround, TableMap } from 'prosemirror-tables';
import type { TextDocumentThread } from '@livedoc/text-documents';
import {
  isToggleOn,
  textFontOf,
  textSizeOf,
  textValuesOf,
  type TextFormatting,
  type TextToggle,
} from './text-document-formatting';
import { alignmentOf, type Alignment } from './text-document-paragraph-formatting';
import { paragraphStyleNameOf } from './text-document-paragraph-styles';
import { placeOf } from './text-document-lists';
import { threadAt, type ThreadStretch } from './text-document-threads';
import { countWriting } from './text-document-word-count';

/** How much Verbalize from cursor location reads (safe range 200..5,000: a live region is read whole; (default)). */
export const VERBALISE_FROM_CURSOR_MAX_CHARS = 1000;

export const NOTHING_SELECTED = 'Nothing selected';
export const END_OF_DOCUMENT = 'End of document';
export const NOT_IN_A_TABLE = 'Not in a table';
export const NO_ROW_HEADER = 'No row header';
export const NO_COLUMN_HEADER = 'No column header';
export const NO_COMMENT_HERE = 'No comment here';

const number = new Intl.NumberFormat('en-GB');

/** A block's text with its leaves (pictures, breaks) as spaces, and white space run together. */
const spoken = (doc: PmNode, from: number, to: number): string =>
  doc.textBetween(from, to, ' ', ' ').replace(/\s+/g, ' ').trim();

/** Verbalize selection: the selected text. */
export function saySelection(state: EditorState): string {
  const { from, to, empty } = state.selection;
  const text = empty ? '' : spoken(state.doc, from, to);
  return text || NOTHING_SELECTED;
}

/** Verbalize from cursor location: from the caret on, cut at a word before the bound. */
export function sayFromCursor(state: EditorState): string {
  const { doc, selection } = state;
  const text = spoken(doc, selection.from, doc.content.size);
  if (!text) return END_OF_DOCUMENT;
  if (text.length <= VERBALISE_FROM_CURSOR_MAX_CHARS) return text;
  const cut = text.slice(0, VERBALISE_FROM_CURSOR_MAX_CHARS + 1);
  const space = cut.lastIndexOf(' ');
  return (
    space > 0 ? cut.slice(0, space) : cut.slice(0, VERBALISE_FROM_CURSOR_MAX_CHARS)
  ).trimEnd();
}

type Cell = {
  readonly row: number;
  readonly column: number;
  readonly rows: number;
  readonly columns: number;
  readonly textAt: (row: number, column: number) => string;
};

/** The table cell holding the caret, where it is in its table, and how to read another cell of that table. */
function cellAt($pos: ResolvedPos): Cell | null {
  const $cell = cellAround($pos);
  if (!$cell) return null;
  const table = $cell.node(-1);
  const start = $cell.start(-1);
  const map = TableMap.get(table);
  const rect = map.findCell($cell.pos - start);
  return {
    row: rect.top,
    column: rect.left,
    rows: map.height,
    columns: map.width,
    textAt: (row, column) => {
      const at = map.map[row * map.width + column]!;
      const node = table.nodeAt(at);
      return node ? node.textContent.replace(/\s+/g, ' ').trim() : '';
    },
  };
}

/** Verbalize cursor location: the page where laid out, the paragraph's style, its list level and its table cell. */
export function sayCursorLocation(
  state: EditorState,
  formatting: TextFormatting,
  page: { readonly page: number; readonly pages: number } | null,
): string {
  const { $from } = state.selection;
  const parts: string[] = [];
  if (page) parts.push(`Page ${number.format(page.page)} of ${number.format(page.pages)}`);
  parts.push(paragraphStyleNameOf(state, formatting.styles) ?? 'Mixed styles');
  const list = placeOf($from.parent);
  if (list) parts.push(`List item, level ${list.level + 1}`);
  const cell = cellAt($from);
  if (cell) parts.push(`Table, row ${cell.row + 1}, column ${cell.column + 1}`);
  return parts.join(', ');
}

const TOGGLE_WORDS: readonly (readonly [TextToggle, string])[] = [
  ['bold', 'bold'],
  ['italic', 'italic'],
  ['underline', 'underline'],
  ['strike', 'strikethrough'],
];

const ALIGNMENT_WORDS: Record<Alignment, string> = {
  start: 'Left aligned',
  center: 'Centred',
  end: 'Right aligned',
  justify: 'Justified',
};

const hostOf = (href: string): string => {
  try {
    return new URL(href).host || href;
  } catch {
    return href;
  }
};

/** Verbalize selection formatting: font, size, what is on, a link, the alignment; "Mixed …" where it differs. */
export function sayFormatting(state: EditorState, formatting: TextFormatting): string {
  const parts: string[] = [];
  parts.push(textFontOf(state, formatting) ?? 'Mixed font');
  const size = textSizeOf(state, formatting);
  parts.push(size === null ? 'Mixed size' : `${number.format(size)} point`);
  for (const [toggle, word] of TOGGLE_WORDS)
    if (isToggleOn(state, formatting, toggle)) parts.push(word);
  const vertical = textValuesOf(state, formatting, 'vertical');
  if (vertical.length === 1 && vertical[0] === 'super') parts.push('superscript');
  if (vertical.length === 1 && vertical[0] === 'sub') parts.push('subscript');
  const { $from, empty } = state.selection;
  const marks = empty ? (state.storedMarks ?? $from.marks()) : ($from.nodeAfter?.marks ?? []);
  const link = marks.find((m) => m.type.name === 'link');
  if (link) parts.push(`Link to ${hostOf(String(link.attrs.href))}`);
  const align = alignmentOf(state, formatting);
  parts.push(align ? ALIGNMENT_WORDS[align] : 'Mixed alignment');
  return parts.join(', ');
}

/** Verbalize word count: the body's words, or the selection's of them. */
export function sayWordCount(body: PmNode, selection: { from: number; to: number } | null): string {
  const all = countWriting(body).words;
  if (!selection || selection.from === selection.to)
    return `${number.format(all)} ${all === 1 ? 'word' : 'words'}`;
  const part = countWriting(body, selection.from, selection.to).words;
  return `${number.format(part)} of ${number.format(all)} words selected`;
}

/** Verbalize table cell location. */
export function sayTableCell(state: EditorState): string {
  const cell = cellAt(state.selection.$from);
  if (!cell) return NOT_IN_A_TABLE;
  const rows = `${cell.rows} ${cell.rows === 1 ? 'row' : 'rows'}`;
  const columns = `${cell.columns} ${cell.columns === 1 ? 'column' : 'columns'}`;
  return `Row ${cell.row + 1}, column ${cell.column + 1} of ${rows} and ${columns}`;
}

export type TableHeaders = 'both' | 'row' | 'column';

/** Verbalize table row and column headers: the first row's cell over the caret, the first column's beside it. */
export function sayTableHeaders(state: EditorState, which: TableHeaders): string {
  const cell = cellAt(state.selection.$from);
  if (!cell) return NOT_IN_A_TABLE;
  const column = cell.row > 0 ? cell.textAt(0, cell.column) : '';
  const row = cell.column > 0 ? cell.textAt(cell.row, 0) : '';
  const columnSaid = column ? `Column header: ${column}` : NO_COLUMN_HEADER;
  const rowSaid = row ? `Row header: ${row}` : NO_ROW_HEADER;
  if (which === 'column') return columnSaid;
  if (which === 'row') return rowSaid;
  return `${rowSaid}, ${columnSaid}`;
}

type Threads = {
  readonly threads: readonly TextDocumentThread[];
  readonly stretches: readonly ThreadStretch[];
};

const threadHere = (state: EditorState, { threads, stretches }: Threads) => {
  const id = threadAt(stretches, state.selection.from);
  const thread = id ? threads.find((t) => t.id === id) : undefined;
  const stretch = id ? stretches.find((s) => s.id === id) : undefined;
  return thread && stretch ? { thread, stretch } : null;
};

/** Verbalize comment: the open thread at the caret, its first comment and how many replies. */
export function sayComment(state: EditorState, threads: Threads): string {
  const here = threadHere(state, threads);
  const first = here?.thread.comments[0];
  if (!here || !first) return NO_COMMENT_HERE;
  const replies = here.thread.comments.length - 1;
  const tail = replies === 0 ? '' : `, ${replies} ${replies === 1 ? 'reply' : 'replies'}`;
  return `Comment by ${first.author.name}: ${first.text.replace(/\s+/g, ' ').trim()}${tail}`;
}

/** Verbalize comment anchor: the text the open thread at the caret is on. */
export function sayCommentAnchor(state: EditorState, threads: Threads): string {
  const here = threadHere(state, threads);
  if (!here) return NO_COMMENT_HERE;
  return (
    spoken(state.doc, here.stretch.from, here.stretch.to) || here.thread.quote || NO_COMMENT_HERE
  );
}
