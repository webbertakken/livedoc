// Markdown imported (docs/specs/034-text-documents/files-and-print.md "Opening"): headings, paragraphs, bulleted,
// numbered and checklist items at their level, code blocks in their language's style, pipe tables (the first row the
// header), and bold, italic, strikethrough and safe links in a line, in a new ODF text document. A picture is never
// fetched: it stays as its alt text in brackets, and the import report says so.
import type { Block, Inline, Paragraph } from '../model/blocks';
import { CODE_BLOCK_LANGUAGES, CodeBlocks, type CodeBlockLanguage } from '../model/code-blocks';
import { ListDefinition, type ListLevel, type ListPlace } from '../model/lists';
import { PageSetup } from '../model/sections';
import { Styles, type Style } from '../model/styles';
import { Tables, type Table } from '../model/tables';
import { TextDocument } from '../model/text-document';
import { pictureText } from '../exports/plain-text';
import type { ReportBuilder } from '../report';
import { parseMarkdown, type MarkdownBlock, type MarkdownRun } from './markdown-blocks';

/** What a fence's info string commonly names, as Google's languages (default). */
const LANGUAGE_ALIASES: Readonly<Record<string, CodeBlockLanguage>> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  cpp: 'c',
  'c++': 'c',
  cs: 'csharp',
  'c#': 'csharp',
  rs: 'rust',
  kt: 'kotlin',
  proto: 'protobuf',
};

/** A fence's language as one of Google's, by id, label or common name; none for another. */
export function codeLanguageOf(info: string | null): CodeBlockLanguage | null {
  if (!info) return null;
  const name = info.toLowerCase();
  const known = CODE_BLOCK_LANGUAGES.find((l) => l.id === name || l.label.toLowerCase() === name);
  return known?.id ?? LANGUAGE_ALIASES[name] ?? null;
}

export function readMarkdownImport(text: string, report: ReportBuilder): TextDocument {
  const blank = TextDocument.blank({ format: 'odf' });
  const styles: Style[] = [...blank.styles];
  const normal = Styles.idOfRole(styles, 'normal')!;
  const lists: Record<string, ListDefinition> = {};
  const startedLists = new Set<string>();
  let pictures = 0;

  const inlinesOf = (runs: readonly MarkdownRun[]): Inline[] =>
    runs.flatMap((run): Inline[] => {
      if (run.picture !== undefined) {
        pictures += 1;
        return [{ type: 'run', text: pictureText(run.text || undefined, undefined), props: {} }];
      }
      if (!run.text) return [];
      const props = {
        ...(run.bold ? { bold: true } : {}),
        ...(run.italic ? { italic: true } : {}),
        ...(run.strike ? { strike: true } : {}),
      };
      return [{ type: 'run', text: run.text, props, ...(run.link ? { link: run.link } : {}) }];
    });
  const paragraph = (style: string, runs: readonly MarkdownRun[], extra = {}): Paragraph => ({
    type: 'paragraph',
    style,
    props: {},
    inlines: inlinesOf(runs),
    ...extra,
  });

  const codeStyle = (language: CodeBlockLanguage | null): string => {
    const held = CodeBlocks.held(styles, language);
    if (held) return held.id;
    // A language's style is based on the plain one, so that comes first.
    if (language) codeStyle(null);
    const style = CodeBlocks.style('odf', language, styles);
    styles.push(style);
    return style.id;
  };

  const listPlace = (block: Extract<MarkdownBlock, { kind: 'item' }>): ListPlace => {
    const id = `L${block.list}`;
    const definition = lists[id] ?? { levels: [...ListDefinition.of(block.marker).levels] };
    // Each level is drawn as its first item asks: a bulleted list may hold numbered items a level down.
    const levels = definition.levels as ListLevel[];
    if (!startedLists.has(`${id}:${block.level}`)) {
      levels[block.level] = ListDefinition.of(block.marker).levels[block.level]!;
      startedLists.add(`${id}:${block.level}`);
    }
    const first = !startedLists.has(id);
    startedLists.add(id);
    lists[id] = definition;
    return {
      id,
      level: block.level,
      ...(block.checked !== undefined ? { checked: block.checked } : {}),
      ...(first && block.start !== undefined && block.start !== 1 ? { restart: block.start } : {}),
    };
  };

  const width = PageSetup.room(blank.section.setup).across;
  const table = (rows: readonly (readonly MarkdownRun[])[][]): Table => {
    const columns = Math.max(1, ...rows.map((row) => row.length));
    const empty = Tables.of({ rows: rows.length, columns, width, style: normal });
    return {
      ...empty,
      headerRows: 1,
      rows: empty.rows.map((row, r) => ({
        ...row,
        cells: row.cells.map((cell, c) => ({
          ...cell,
          blocks: [paragraph(normal, rows[r]![c] ?? [])],
        })),
      })),
    };
  };

  const body = parseMarkdown(text).flatMap((block): Block[] => {
    switch (block.kind) {
      case 'heading':
        return [
          paragraph(Styles.idOfRole(styles, `heading${block.level}` as 'heading1')!, block.runs),
        ];
      case 'item':
        return [paragraph(normal, block.runs, { list: listPlace(block) })];
      case 'code': {
        const style = codeStyle(codeLanguageOf(block.language));
        return (block.lines.length > 0 ? block.lines : ['']).map((line) =>
          paragraph(style, line ? [{ text: line }] : []),
        );
      }
      case 'table':
        return [table(block.rows)];
      default:
        return [paragraph(normal, block.runs)];
    }
  });
  if (pictures > 0) report.drop('external', 'remote picture', pictures);
  return {
    ...blank,
    styles,
    lists,
    body: body.length > 0 ? body : blank.body,
  };
}
