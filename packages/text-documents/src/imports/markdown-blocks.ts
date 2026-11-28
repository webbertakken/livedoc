// Markdown read into the writing (docs/specs/034-text-documents/text-and-paragraphs.md "Typing aids", "Clipboard";
// files-and-print.md "Opening"): the part Google reads, as pure values: headings, paragraphs, bulleted, numbered and
// checklist items at their nesting level, quotes as their text, code blocks with their language, pipe tables, and in a
// line's text bold, italic, strikethrough, code as text, links and pictures.
import { isSafeLink } from '../report';

export type MarkdownRun = {
  readonly text: string;
  readonly bold?: true;
  readonly italic?: true;
  readonly strike?: true;
  readonly link?: string;
  /** A picture `![alt](url)`: its address; the run's text is its alt text. */
  readonly picture?: string;
};

export type MarkdownBlock =
  | { readonly kind: 'paragraph'; readonly runs: readonly MarkdownRun[] }
  | { readonly kind: 'heading'; readonly level: number; readonly runs: readonly MarkdownRun[] }
  | {
      readonly kind: 'item';
      /** The list it belongs to: one per run of items at the top level. */
      readonly list: number;
      readonly level: number;
      readonly marker: 'bullet' | 'number' | 'check';
      readonly start?: number;
      readonly checked?: boolean;
      readonly runs: readonly MarkdownRun[];
    }
  | { readonly kind: 'code'; readonly language: string | null; readonly lines: readonly string[] }
  /** A pipe table: rows of cells of runs, the first row its header. */
  | { readonly kind: 'table'; readonly rows: readonly (readonly MarkdownRun[])[][] };

type Style = Omit<MarkdownRun, 'text' | 'picture'>;

// Each delimiter, what it makes, and whether its inner text is read again for more.
const SPANS: readonly { open: string; close: string; style: Style }[] = [
  { open: '**', close: '**', style: { bold: true } },
  { open: '__', close: '__', style: { bold: true } },
  { open: '~~', close: '~~', style: { strike: true } },
  { open: '*', close: '*', style: { italic: true } },
  { open: '_', close: '_', style: { italic: true } },
];

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~>|]/;

function push(runs: MarkdownRun[], text: string, style: Style): void {
  if (!text) return;
  const last = runs.at(-1);
  const same =
    last &&
    last.bold === style.bold &&
    last.italic === style.italic &&
    last.strike === style.strike &&
    last.link === style.link &&
    last.picture === undefined;
  if (same) runs[runs.length - 1] = { ...last, text: last.text + text };
  else runs.push({ text, ...style });
}

/** A line's Markdown as runs of text with their formatting. */
export function markdownInline(text: string, style: Style = {}): MarkdownRun[] {
  const runs: MarkdownRun[] = [];
  let plain = '';
  let i = 0;
  const flush = () => {
    push(runs, plain, style);
    plain = '';
  };
  while (i < text.length) {
    const char = text[i]!;
    if (char === '\\' && ESCAPABLE.test(text[i + 1] ?? '')) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    if (char === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        plain += text.slice(i + 1, end);
        i = end + 1;
        continue;
      }
    }
    if (char === '!' && text[i + 1] === '[') {
      const picture = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (picture) {
        flush();
        runs.push({ text: picture[1]!, ...style, picture: picture[2]! });
        i += picture[0].length;
        continue;
      }
    }
    if (char === '[') {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (link && isSafeLink(link[2]!)) {
        flush();
        for (const run of markdownInline(link[1]!, { ...style, link: link[2]! }))
          push(runs, run.text, run);
        i += link[0].length;
        continue;
      }
    }
    if (char === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/.exec(text.slice(i));
      if (auto && isSafeLink(auto[1]!)) {
        flush();
        push(runs, auto[1]!.replace(/^mailto:/, ''), { ...style, link: auto[1]! });
        i += auto[0].length;
        continue;
      }
    }
    const span = SPANS.find((s) => text.startsWith(s.open, i));
    if (span) {
      const inner = i + span.open.length;
      const end = text.indexOf(span.close, inner + 1);
      // A span opens on a character, never a space, and an underscore only at a word's edge.
      const next = text[inner];
      const opens = next !== undefined && !/\s/.test(next);
      const wordEdge = span.open[0] !== '_' || i === 0 || /\W/.test(text[i - 1]!);
      if (end > inner && opens && wordEdge && !/\s/.test(text[end - 1]!)) {
        flush();
        for (const run of markdownInline(text.slice(inner, end), { ...style, ...span.style }))
          push(runs, run.text, run);
        i = end + span.close.length;
        continue;
      }
    }
    plain += char;
    i += 1;
  }
  flush();
  return runs;
}

const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])\s+(.*)$/;
const CHECK = /^\[([ xX])\]\s+(.*)$/;
const FENCE = /^ {0,3}(```|~~~)\s*([^\s`]*)/;
/** A pipe table's delimiter line: cells of dashes, each with an optional colon at either end. */
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A pipe table line's cells: split on each unescaped `|`, the outer pipes dropped. */
function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  const body = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '');
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '\\' && body[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (body[i] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += body[i];
  }
  cells.push(cell.trim());
  return cells;
}
const RULE = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;

/** Markdown text as the blocks it reads as. */
export function parseMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let lists = 0;
  let inList = false;
  // Whether the open list's top items are numbered: a top item of the other kind starts a new list.
  let numbered = false;
  // Each open nesting's indent, deepest last.
  let indents: number[] = [];
  const endParagraph = () => {
    if (paragraph.length === 0) return;
    // A line ending in two spaces or a backslash breaks the line; others join with a space.
    const joined = paragraph
      .map((line, i) =>
        i === paragraph.length - 1
          ? line.trimEnd()
          : / {2,}$|\\$/.test(line)
            ? `${line.replace(/ {2,}$|\\$/, '')}\n`
            : `${line.trim()} `,
      )
      .join('');
    blocks.push({ kind: 'paragraph', runs: markdownInline(joined.trim()) });
    paragraph = [];
  };
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n]!;
    if (FENCE.test(line)) {
      endParagraph();
      inList = false;
      const [, fence = '', language = ''] = FENCE.exec(line)!;
      const code: string[] = [];
      for (n += 1; n < lines.length && !lines[n]!.trimStart().startsWith(fence); n += 1)
        code.push(lines[n]!);
      blocks.push({ kind: 'code', language: language || null, lines: code });
      continue;
    }
    if (line.trim() === '') {
      endParagraph();
      continue;
    }
    if (RULE.test(line)) {
      endParagraph();
      inList = false;
      continue;
    }
    if (paragraph.length === 0 && line.includes('|') && TABLE_RULE.test(lines[n + 1] ?? '')) {
      inList = false;
      const rows = [tableCells(line)];
      for (n += 2; n < lines.length && lines[n]!.includes('|') && lines[n]!.trim() !== ''; n += 1)
        rows.push(tableCells(lines[n]!));
      n -= 1;
      blocks.push({
        kind: 'table',
        rows: rows.map((row) => row.map((cell) => markdownInline(cell))),
      });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      inList = false;
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        runs: markdownInline(heading[2] ?? ''),
      });
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      endParagraph();
      const indent = item[1]!.replace(/\t/g, '    ').length;
      const isNumbered = item[3] !== undefined;
      if (!inList || (indent <= indents[0]! && isNumbered !== numbered)) {
        lists += 1;
        indents = [indent];
        numbered = isNumbered;
      }
      inList = true;
      while (indents.length > 1 && indent < indents.at(-1)!) indents.pop();
      if (indent > indents.at(-1)!) indents.push(indent);
      const check = CHECK.exec(item[4]!);
      const number = item[3];
      blocks.push({
        kind: 'item',
        list: lists,
        level: Math.min(8, indents.length - 1),
        marker: check ? 'check' : number !== undefined ? 'number' : 'bullet',
        ...(number !== undefined ? { start: Number(number) } : {}),
        ...(check ? { checked: check[1] !== ' ' } : {}),
        runs: markdownInline(check ? check[2]! : item[4]!),
      });
      continue;
    }
    const quote = QUOTE.exec(line);
    if (quote) {
      paragraph.push(quote[1]!);
      continue;
    }
    // A line under an item, indented, carries the item on.
    const last = blocks.at(-1);
    if (inList && paragraph.length === 0 && last?.kind === 'item' && /^\s+\S/.test(line)) {
      const runs: MarkdownRun[] = [...last.runs];
      for (const run of markdownInline(` ${line.trim()}`)) push(runs, run.text, run);
      blocks[blocks.length - 1] = { ...last, runs };
      continue;
    }
    inList = false;
    paragraph.push(line);
  }
  endParagraph();
  return blocks;
}

const BLOCK_SIGNS = [HEADING, ITEM, FENCE, QUOTE];
const INLINE_SIGNS =
  /\*\*[^*\s][^*]*\*\*|__[^_\s][^_]*__|~~[^~\s][^~]*~~|\[[^\]]+\]\([^)\s]+\)|`[^`]+`/;

/** Whether text reads as Markdown: a line that is a heading, item, fence or quote, or a span of its own. */
export const looksLikeMarkdown = (text: string): boolean =>
  text
    .split(/\r?\n/)
    .some((line) => BLOCK_SIGNS.some((sign) => sign.test(line) && /\S/.test(line))) ||
  INLINE_SIGNS.test(text);
