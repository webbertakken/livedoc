// Download as Markdown (docs/specs/034-text-documents/files-and-print.md "Downloading"): CommonMark with GitHub's
// extensions. Headings by level, bold, italic and strikethrough, links, bulleted, numbered and checklist items at their
// level, tables as pipe tables (the first row the header), code blocks fenced with their language, footnotes, a
// picture as its alt text (Markdown is one file), an equation in its linear form between dollars. What Markdown cannot
// say (colours, sizes, alignment) is left out. Text that would read as Markdown is escaped.
import type { Block, Inline, Paragraph } from '../model/blocks';
import { DocumentTabs } from '../model/document-tabs';
import { Equations } from '../model/equations';
import { ParagraphRefs } from '../model/paragraph-refs';
import { Blocks } from '../model/tables';
import type { Table } from '../model/tables';
import type { TextDocument } from '../model/text-document';
import { isSafeLink } from '../report';
import {
  codeBlockOf,
  exportContext,
  exportTabs,
  inlineProps,
  paragraphRole,
  tabsTitled,
  type ExportContext,
} from './export-walk';
import { pictureText } from './plain-text';

/** Characters CommonMark reads as markup anywhere in a line. */
const INLINE_SPECIAL = /[\\`*_[\]<>|~$]/g;

/** Text escaped so it reads as itself: markup characters, and a line start that would open a block. */
export function escapeMarkdown(text: string): string {
  return text
    .replace(INLINE_SPECIAL, (c) => `\\${c}`)
    .replace(/^(\s*)([#+-])(?=\s|$)/gm, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(?=\s|$)/gm, '$1\\$2');
}

/**
 * What the walk reads: the export's context, and whether pending suggestions show in CriticMarkup (`{++inserted++}`,
 * `{--deleted--}`), as an agent's text view reads a document not settled (agents-and-sync.md "Reading").
 */
type MarkdownContext = ExportContext & { readonly critic?: boolean };

type Suggested = 'insertion' | 'deletion' | null;

type Mark = {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  link: string | null;
  suggested: Suggested;
};

const sameMark = (a: Mark, b: Mark) =>
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.strike === b.strike &&
  a.link === b.link &&
  a.suggested === b.suggested;

/** Text in CriticMarkup as the suggestion it is part of. */
const critic = (text: string, suggested: 'insertion' | 'deletion') =>
  suggested === 'insertion' ? `{++${text}++}` : `{--${text}--}`;

/** A pending suggestion an inline is part of, where the context shows them. */
function suggestedOf(context: MarkdownContext, inline: Inline): Suggested {
  if (!context.critic || !('suggested' in inline) || !inline.suggested) return null;
  if (inline.suggested.deletion) return 'deletion';
  return inline.suggested.insertion ? 'insertion' : null;
}

/** Text wrapped in its marks, the spaces at its edges kept outside them as CommonMark asks. */
function marked(text: string, mark: Mark): string {
  const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
  if (!core) return mark.suggested ? critic(text, mark.suggested) : text;
  let out = core;
  if (mark.strike) out = `~~${out}~~`;
  if (mark.italic) out = `*${out}*`;
  if (mark.bold) out = `**${out}**`;
  if (mark.link) out = `[${out}](<${mark.link.replace(/[<>]/g, encodeURIComponent)}>)`;
  const whole = `${lead}${out}${trail}`;
  return mark.suggested ? critic(whole, mark.suggested) : whole;
}

/** An inline's Markdown before its marks: text escaped, a note's reference, an object's stand-in. */
function inlineMarkdown(context: MarkdownContext, inline: Inline): string {
  switch (inline.type) {
    case 'run':
    case 'field':
      // A line break as Markdown's hard break: the escaped text's lines joined by a backslash.
      return escapeMarkdown(inline.text).split('\n').join('\\\n');
    case 'note':
      return `[^${context.notes.get(inline) ?? ''}]`;
    case 'picture':
      return inline.decorative ? '' : escapeMarkdown(pictureText(inline.alt, inline.title));
    case 'equation':
      // Between dollars, a backslash and a dollar of its own escaped, so neither ends it.
      return `$${Equations.linear(inline.math).replace(/[\\$]/g, (c) => `\\${c}`)}$`;
    default:
      return '';
  }
}

/** A paragraph's text in Markdown: runs of the same marks gathered, so `**a** **b**` reads `**a b**`. */
function paragraphText(context: MarkdownContext, paragraph: Paragraph): string {
  const pieces: { text: string; mark: Mark }[] = [];
  for (const inline of paragraph.inlines) {
    const text = inlineMarkdown(context, inline);
    if (!text) continue;
    const props = inlineProps(context, inline);
    // A place in the document has no address in a Markdown file: its text stays, unlinked.
    const link =
      'link' in inline && inline.link && !inline.link.startsWith('#') && isSafeLink(inline.link)
        ? inline.link
        : null;
    // A note's reference and an equation carry no emphasis of their own.
    const plain = inline.type === 'note' || inline.type === 'equation';
    const mark: Mark = {
      bold: !plain && props.bold === true,
      italic: !plain && props.italic === true,
      strike: !plain && props.strike === true,
      link,
      suggested: suggestedOf(context, inline),
    };
    const last = pieces.at(-1);
    if (last && sameMark(last.mark, mark)) last.text += text;
    else pieces.push({ text, mark });
  }
  return pieces.map(({ text, mark }) => marked(text, mark)).join('');
}

/** How far a list item is indented: four spaces a level, deep enough under any marker. */
const LIST_INDENT = '    ';

/** A paragraph as a Markdown block: a heading, a list item, a fenced code block, or a paragraph. */
function paragraphBlock(
  context: MarkdownContext,
  paragraph: Paragraph,
): { text: string; tight: boolean } {
  const code = codeBlockOf(context, paragraph);
  if (code) {
    const body = paragraph.inlines
      .map((i) => (i.type === 'run' || i.type === 'field' ? i.text : ''))
      .join('');
    const longest = Math.max(2, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
    const fence = '`'.repeat(longest + 1);
    return { text: `${fence}${code.language ?? ''}\n${body}\n${fence}`, tight: false };
  }
  const text = paragraphText(context, paragraph);
  const marker = context.markers.get(paragraph);
  if (marker) {
    const indent = LIST_INDENT.repeat(marker.level);
    const lead =
      marker.kind === 'check'
        ? `- [${marker.checked ? 'x' : ' '}]`
        : marker.kind === 'number'
          ? `${/^\d+/.exec(marker.text)?.[0] ?? '1'}.`
          : '-';
    return { text: `${indent}${lead} ${text}`, tight: true };
  }
  const role = paragraphRole(context, paragraph);
  if (!text) return { text: '', tight: false };
  if (role.kind === 'title') return { text: `# ${text}`, tight: false };
  if (role.kind === 'subtitle')
    return {
      text: marked(text, { bold: true, italic: false, strike: false, link: null, suggested: null }),
      tight: false,
    };
  if (role.kind === 'heading') return { text: `${'#'.repeat(role.level)} ${text}`, tight: false };
  return { text, tight: false };
}

/** A cell's text on one line: its paragraphs joined by `<br>`, a table inside it as its cells' text, pipes escaped. */
function cellText(context: MarkdownContext, blocks: readonly Block[]): string {
  return blocks
    .flatMap((block): string[] =>
      block.type === 'table'
        ? [
            block.rows
              .flatMap((row) => row.cells.map((cell) => cellText(context, cell.blocks)))
              .filter((t) => t !== '')
              .join(' '),
          ]
        : markdownBlocks(context, [block]).map((b) => b.text),
    )
    .filter((t) => t !== '')
    .join('<br>')
    .replace(/\n/g, '<br>');
}

/** A table's rows as pipe-table lines, a merged cell's other places left empty, and the rule under the header. */
function tableLines(context: MarkdownContext, table: Table): { rows: string[]; rule: string } {
  const width = Math.max(
    1,
    ...table.rows.map((row) => row.cells.reduce((n, cell) => n + (cell.colSpan ?? 1), 0)),
  );
  const rows = table.rows.map((row) => {
    const cells = row.cells.flatMap((cell) => [
      cellText(context, cell.blocks),
      ...Array.from({ length: (cell.colSpan ?? 1) - 1 }, () => ''),
    ]);
    while (cells.length < width) cells.push('');
    return `| ${cells.join(' | ')} |`;
  });
  return { rows, rule: `|${' --- |'.repeat(width)}` };
}

/** A table as a pipe table: the first row the header. */
function tableBlock(context: MarkdownContext, table: Table): string {
  const { rows, rule } = tableLines(context, table);
  const width = rule.split('---').length - 1;
  return [rows[0] ?? `|${'  |'.repeat(width)}`, rule, ...rows.slice(1)].join('\n');
}

type MarkdownBlock = { text: string; tight: boolean };

function markdownBlocks(context: MarkdownContext, blocks: readonly Block[]): MarkdownBlock[] {
  return blocks.flatMap((block): MarkdownBlock[] => {
    switch (block.type) {
      case 'paragraph':
        return [paragraphBlock(context, block)];
      case 'table':
        return [{ text: tableBlock(context, block), tight: false }];
      case 'contents':
        // A table of contents as a list of its headings, their page numbers left out (a file has no pages).
        return block.entries.map((entry) => ({
          text: `- ${paragraphText(context, entry).replace(/\t[^\t\n]*$/, '')}`,
          tight: true,
        }));
      default:
        return [];
    }
  });
}

/** Blocks joined: list items one after another, everything else apart by an empty line; empty paragraphs dropped. */
function joined(blocks: readonly MarkdownBlock[]): string {
  let out = '';
  let previous: MarkdownBlock | null = null;
  for (const block of blocks) {
    if (!block.text) {
      previous = null;
      continue;
    }
    if (out) out += previous?.tight && block.tight ? '\n' : '\n\n';
    out += block.text;
    previous = block;
  }
  return out;
}

/** The document as Markdown. */
export function writeMarkdown(document: TextDocument): string {
  const context = exportContext(document);
  const tabs = exportTabs(document);
  const titled = tabsTitled(tabs);
  const blocks = tabs.flatMap((tab): MarkdownBlock[] => [
    ...(titled ? [{ text: `# ${escapeMarkdown(tab.name)}`, tight: false }] : []),
    ...markdownBlocks(context, tab.body),
  ]);
  const notes = [...context.notes].map(([note, n]) => ({
    text: `[^${n}]: ${markdownBlocks(context, note.blocks)
      .map((b) => b.text)
      .filter((t) => t !== '')
      .join(' ')}`,
    tight: true,
  }));
  const body = joined(blocks);
  const end = joined(notes);
  return `${body}${body && end ? '\n\n' : ''}${end}\n`;
}

/**
 * One piece of a document tab's Markdown as an agent's text view reads it (agents-and-sync.md "Reading"): a paragraph
 * with its number, a table's rows each with the numbers of the paragraphs it holds, a table of contents' entry, or
 * kept content by name. Empty paragraphs are pieces too, with no text.
 */
export type MarkdownPiece =
  | {
      readonly kind: 'paragraph';
      readonly number: number;
      readonly text: string;
      readonly tight: boolean;
    }
  | {
      readonly kind: 'table';
      readonly rows: readonly {
        readonly first: number;
        readonly count: number;
        readonly text: string;
      }[];
      readonly rule: string;
    }
  | { readonly kind: 'contents'; readonly text: string }
  | { readonly kind: 'kept'; readonly name: string };

/** A footnote's definition, `[^n]: …`, with the paragraph its mark sits in. */
export type MarkdownNote = { readonly paragraph: number; readonly text: string };

export type TabMarkdown = {
  readonly pieces: readonly MarkdownPiece[];
  readonly notes: readonly MarkdownNote[];
};

/** A document tab's writing as Markdown pieces, list markers and note numbers counted through the whole document. */
export function tabMarkdown(document: TextDocument, tabId: string): TabMarkdown | null {
  const tab = DocumentTabs.all(document).find((t) => t.id === tabId);
  if (!tab) return null;
  const context: MarkdownContext = { ...exportContext(document), critic: true };
  const numbers = ParagraphRefs.numbers(tab.body);
  const numberOf = (p: Paragraph) => numbers.get(p) ?? 0;
  const pieces = tab.body.flatMap((block): MarkdownPiece[] => {
    switch (block.type) {
      case 'paragraph':
        return [{ kind: 'paragraph', number: numberOf(block), ...paragraphBlock(context, block) }];
      case 'table': {
        const { rows, rule } = tableLines(context, block);
        return [
          {
            kind: 'table',
            rule,
            rows: block.rows.map((row, i) => {
              const held = Blocks.paragraphs(row.cells.flatMap((cell) => cell.blocks));
              return {
                first: held[0] ? numberOf(held[0]) : 0,
                count: held.length,
                text: rows[i] ?? '',
              };
            }),
          },
        ];
      }
      case 'contents':
        return markdownBlocks(context, [block]).map((b) => ({ kind: 'contents', text: b.text }));
      case 'kept':
        return [{ kind: 'kept', name: block.name }];
      default:
        return [];
    }
  });
  const notes = ParagraphRefs.of(tab.body).flatMap((paragraph) =>
    paragraph.inlines.flatMap((inline): MarkdownNote[] =>
      inline.type === 'note'
        ? [
            {
              paragraph: numberOf(paragraph),
              text: `[^${context.notes.get(inline) ?? ''}]: ${markdownBlocks(context, inline.blocks)
                .map((b) => b.text)
                .filter((t) => t !== '')
                .join(' ')}`,
            },
          ]
        : [],
    ),
  );
  return { pieces, notes };
}
