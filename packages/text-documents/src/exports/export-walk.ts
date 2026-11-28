// What every export reads of a text document (docs/specs/034-text-documents/files-and-print.md "Downloading"): its
// document tabs in order, each block with what a reader of another format needs: a paragraph's heading level, its
// list marker as drawn, its code block's language, and each footnote's number through the whole document. Pure; the
// document is read settled (suggestions accepted, as print has them) by the caller.
import type { Block, Inline, Note, Paragraph } from '../model/blocks';
import { CodeBlocks, type CodeBlockLanguage } from '../model/code-blocks';
import { DocumentTabs } from '../model/document-tabs';
import { ListMarkers, type ListMarker } from '../model/list-markers';
import type { ListDefinition } from '../model/lists';
import type { TextProps } from '../model/props';
import { Styles, type Style } from '../model/styles';
import { Blocks } from '../model/tables';
import type { TextDocument } from '../model/text-document';

/** How an export reads a paragraph: a title, a subtitle, a heading of a level, or body text. */
export type ParagraphRole =
  | { readonly kind: 'title' | 'subtitle' | 'body' }
  | { readonly kind: 'heading'; readonly level: number };

/** One document tab as an export writes it. */
export type ExportTab = {
  readonly name: string;
  readonly depth: number;
  readonly body: readonly Block[];
};

/** What an export needs to read a document's paragraphs. */
export type ExportContext = {
  readonly styles: readonly Style[];
  readonly lists: Readonly<Record<string, ListDefinition>>;
  readonly markers: ReadonlyMap<Paragraph, ListMarker>;
  readonly notes: ReadonlyMap<Note, number>;
};

/** Every document tab, in the outline's order. */
export const exportTabs = (document: TextDocument): ExportTab[] =>
  DocumentTabs.all(document).map(({ name, depth, body }) => ({ name, depth, body }));

/** Whether the tabs' names head their writing: only when the document has more than one (default). */
export const tabsTitled = (tabs: readonly ExportTab[]): boolean => tabs.length > 1;

/** The paragraphs of blocks, table cells' and contents' entries included, in reading order. */
function paragraphsIn(blocks: readonly Block[]): Paragraph[] {
  return blocks.flatMap((block): Paragraph[] =>
    block.type === 'paragraph'
      ? [block]
      : block.type === 'contents'
        ? [...block.entries]
        : block.type === 'table'
          ? Blocks.paragraphs([block])
          : [],
  );
}

/** The document's markers and note numbers, counted through every tab in order. */
export function exportContext(document: TextDocument): ExportContext {
  const paragraphs = exportTabs(document).flatMap((tab) => paragraphsIn(tab.body));
  const markers = new Map<Paragraph, ListMarker>();
  ListMarkers.of(
    paragraphs.map((p) => p.list),
    document.lists,
  ).forEach((marker, i) => {
    if (marker) markers.set(paragraphs[i]!, marker);
  });
  const notes = new Map<Note, number>();
  for (const paragraph of paragraphs)
    for (const inline of paragraph.inlines)
      if (inline.type === 'note') notes.set(inline, notes.size + 1);
  return { styles: document.styles, lists: document.lists, markers, notes };
}

/** A paragraph's role, from its style's role or outline level. */
export function paragraphRole(context: ExportContext, paragraph: Paragraph): ParagraphRole {
  const style = Styles.byId(context.styles, paragraph.style);
  if (style?.role === 'title') return { kind: 'title' };
  if (style?.role === 'subtitle') return { kind: 'subtitle' };
  const level =
    paragraph.props.outlineLevel ?? Styles.outlineLevel(context.styles, paragraph.style);
  return level !== undefined && level >= 1
    ? { kind: 'heading', level: Math.min(level, 6) }
    : { kind: 'body' };
}

/** The code block a paragraph is: its language, null for none; undefined for no code block. */
export const codeBlockOf = (
  context: ExportContext,
  paragraph: Paragraph,
): { language: CodeBlockLanguage | null } | undefined =>
  CodeBlocks.of(context.styles, paragraph.style);

/** An inline's own formatting: its text style's, then its direct formatting (never its paragraph style's). */
export function inlineProps(context: ExportContext, inline: Inline): TextProps {
  const style = 'style' in inline ? Styles.byId(context.styles, inline.style) : undefined;
  return { ...style?.text, ...inline.props };
}
