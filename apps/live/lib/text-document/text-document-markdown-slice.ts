// Markdown text pasted into the writing (docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard"): its blocks
// as paragraphs, a heading naming its level (`@heading<n>`) and an item its list (`@paste:md-<n>`) until the paste
// places them in the document, as pasted HTML's are.
import { Fragment, Slice, type Mark, type Schema } from 'prosemirror-model';
import type { ListPlace } from '@livedoc/text-documents';
import { parseMarkdown, type MarkdownRun } from '@livedoc/text-documents';
import {
  PASTE_HEADING_PREFIX,
  PASTE_LIST_PREFIX,
  type PastedListLevel,
  type PastedLists,
} from './text-document-paste-html';

function marksOf(schema: Schema, run: MarkdownRun): Mark[] {
  const on = { value: true };
  return [
    ...(run.bold ? [schema.marks.bold!.create(on)] : []),
    ...(run.italic ? [schema.marks.italic!.create(on)] : []),
    ...(run.strike ? [schema.marks.strike!.create(on)] : []),
    ...(run.link ? [schema.marks.link!.create({ href: run.link })] : []),
  ];
}

/** The Markdown's slice, open at both ends, and the lists its items name. */
export function markdownSlice(text: string, schema: Schema): { slice: Slice; lists: PastedLists } {
  const lists: PastedLists = new Map();
  const started = new Set<number>();
  const runsOf = (runs: readonly MarkdownRun[]) =>
    runs.filter((run) => run.text).map((run) => schema.text(run.text, marksOf(schema, run)));
  const paragraphs = parseMarkdown(text).flatMap((block) => {
    // A code block's lines and a table's rows paste as paragraphs, a row's cells split by tabs.
    if (block.kind === 'code')
      return block.lines.map((line) =>
        schema.nodes.paragraph!.create(null, line ? [schema.text(line)] : []),
      );
    if (block.kind === 'table')
      return block.rows.map((row) =>
        schema.nodes.paragraph!.create(
          null,
          row.flatMap((cell, i) => [...(i > 0 ? [schema.text('\t')] : []), ...runsOf(cell)]),
        ),
      );
    const content = runsOf(block.runs);
    if (block.kind === 'paragraph') return schema.nodes.paragraph!.create(null, content);
    if (block.kind === 'heading')
      return schema.nodes.paragraph!.create(
        { style: `${PASTE_HEADING_PREFIX}${block.level}` },
        content,
      );
    const key = `md-${block.list}`;
    const drawn: PastedListLevel = {
      kind: block.marker,
      ...(block.marker === 'number' ? { format: 'decimal' } : {}),
    };
    const levels = lists.get(key) ?? new Map<number, PastedListLevel>();
    if (!levels.has(block.level)) levels.set(block.level, drawn);
    lists.set(key, levels);
    // A numbered list starts at its first item's number.
    const first = !started.has(block.list);
    started.add(block.list);
    const place: ListPlace = {
      id: `${PASTE_LIST_PREFIX}${key}`,
      level: block.level,
      ...(block.checked !== undefined ? { checked: block.checked } : {}),
      ...(first && block.start !== undefined && block.start !== 1 ? { restart: block.start } : {}),
    };
    return schema.nodes.paragraph!.create({ list: place }, content);
  });
  return {
    slice: paragraphs.length > 0 ? new Slice(Fragment.from(paragraphs), 1, 1) : Slice.empty,
    lists,
  };
}
