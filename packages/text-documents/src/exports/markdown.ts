// Download as Markdown (docs/specs/034-text-documents/files-and-print.md "Downloading"): CommonMark with GitHub's
// extensions. Headings by level, bold, italic and strikethrough, links, bulleted, numbered and checklist items at their
// level, tables as pipe tables (the first row the header), code blocks fenced with their language, footnotes, a
// picture as its alt text (Markdown is one file), an equation in its linear form between dollars. What Markdown cannot
// say (colours, sizes, alignment) is left out. Text that would read as Markdown is escaped.
import type { Block, Inline, Paragraph } from '../model/blocks';
import { Equations } from '../model/equations';
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

type Mark = { bold: boolean; italic: boolean; strike: boolean; link: string | null };

const sameMark = (a: Mark, b: Mark) =>
  a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.link === b.link;

/** Text wrapped in its marks, the spaces at its edges kept outside them as CommonMark asks. */
function marked(text: string, mark: Mark): string {
  const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
  if (!core) return text;
  let out = core;
  if (mark.strike) out = `~~${out}~~`;
  if (mark.italic) out = `*${out}*`;
  if (mark.bold) out = `**${out}**`;
  if (mark.link) out = `[${out}](<${mark.link.replace(/[<>]/g, encodeURIComponent)}>)`;
  return `${lead}${out}${trail}`;
}

/** An inline's Markdown before its marks: text escaped, a note's reference, an object's stand-in. */
function inlineMarkdown(context: ExportContext, inline: Inline): string {
  switch (inline.type) {
    case 'run':
    case 'field':
      return escapeMarkdown(inline.text).replace(/\n/g, '\\\n');
    case 'note':
      return `[^${context.notes.get(inline) ?? ''}]`;
    case 'picture':
      return inline.decorative ? '' : escapeMarkdown(pictureText(inline.alt, inline.title));
    case 'equation':
      return `$${Equations.linear(inline.math).replace(/\$/g, '\\$')}$`;
    default:
      return '';
  }
}

/** A paragraph's text in Markdown: runs of the same marks gathered, so `**a** **b**` reads `**a b**`. */
function paragraphText(context: ExportContext, paragraph: Paragraph): string {
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
  context: ExportContext,
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
      text: marked(text, { bold: true, italic: false, strike: false, link: null }),
      tight: false,
    };
  if (role.kind === 'heading') return { text: `${'#'.repeat(role.level)} ${text}`, tight: false };
  return { text, tight: false };
}

/** A cell's text on one line: its paragraphs joined by `<br>`, a table inside it as its cells' text, pipes escaped. */
function cellText(context: ExportContext, blocks: readonly Block[]): string {
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

/** A table as a pipe table: the first row the header, a merged cell's other places left empty. */
function tableBlock(context: ExportContext, table: Table): string {
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
  const rule = `|${' --- |'.repeat(width)}`;
  return [rows[0] ?? `|${'  |'.repeat(width)}`, rule, ...rows.slice(1)].join('\n');
}

type MarkdownBlock = { text: string; tight: boolean };

function markdownBlocks(context: ExportContext, blocks: readonly Block[]): MarkdownBlock[] {
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
