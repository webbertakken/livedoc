// An agent's Markdown as the document's own blocks (docs/specs/034-text-documents/agents-and-sync.md "How the writing
// lands"): read as Markdown is opened, then each paragraph in the document's style of its role (a code block's style
// added when the document lacks it), each list a new list of the document's, each table as wide as the text.
import type * as Y from 'yjs';
import { readMarkdownImport } from '../imports/markdown';
import { markdownInline } from '../imports/markdown-blocks';
import { setLiveList, setLiveStyles } from '../live/live-write';
import type { Block, Paragraph, Run } from '../model/blocks';
import { CodeBlocks } from '../model/code-blocks';
import { PageSetup } from '../model/sections';
import { Styles, type Style } from '../model/styles';
import type { TextDocumentFormat } from '../model/text-document';
import { ReportBuilder } from '../report';
import { TextDocumentState } from '../text-document-state';

export type MarkdownTarget = {
  readonly doc: Y.Doc;
  readonly format: TextDocumentFormat;
  /** A new list's id, free in the document. */
  readonly newId: () => string;
  /** The transaction's origin, for the styles and lists written. */
  readonly origin: unknown;
};

/** A line's Markdown as runs: bold, italic, strikethrough and safe links; code as text. */
export function markdownRuns(text: string): Run[] {
  return markdownInline(text).flatMap((run): Run[] =>
    run.text
      ? [
          {
            type: 'run',
            text: run.text,
            props: {
              ...(run.bold ? { bold: true } : {}),
              ...(run.italic ? { italic: true } : {}),
              ...(run.strike ? { strike: true } : {}),
            },
            ...(run.link ? { link: run.link } : {}),
          },
        ]
      : [],
  );
}

/** The paragraph styles of the Markdown's blocks as the document's, adding those it lacks. */
class StyleAdopter {
  readonly #held: Style[];
  readonly #added: Style[] = [];
  readonly #normal: string;
  readonly #format: TextDocumentFormat;

  constructor(held: readonly Style[], format: TextDocumentFormat) {
    this.#format = format;
    this.#held = [...held];
    this.#normal = Styles.idOfRole(held, 'normal') ?? held[0]?.id ?? '';
  }

  adopt(imported: readonly Style[], id: string): string {
    const style = Styles.byId(imported, id);
    const role = style?.role && Styles.idOfRole(this.#held, style.role);
    if (role) return role;
    const code = CodeBlocks.of(imported, id);
    if (code) return this.#code(code.language).id;
    return this.#normal;
  }

  #code(language: Parameters<typeof CodeBlocks.held>[1]): Style {
    const held = CodeBlocks.held(this.#held, language);
    if (held) return held;
    // A language's style is based on the plain one, so that comes first.
    if (language) this.#code(null);
    const style = CodeBlocks.style(this.#format, language, this.#held);
    this.#held.push(style);
    this.#added.push(style);
    return style;
  }

  get added(): readonly Style[] {
    return this.#added;
  }
}

function mapParagraphs(blocks: readonly Block[], map: (p: Paragraph) => Paragraph): Block[] {
  return blocks.map((block) =>
    block.type === 'paragraph'
      ? map(block)
      : block.type === 'table'
        ? {
            ...block,
            rows: block.rows.map((row) => ({
              ...row,
              cells: row.cells.map((cell) => ({
                ...cell,
                blocks: mapParagraphs(cell.blocks, map),
              })),
            })),
          }
        : block,
  );
}

/** The Markdown's blocks for the document, its new styles and lists written into the state. */
export function markdownBlocks(markdown: string, target: MarkdownTarget): Block[] {
  const read = readMarkdownImport(markdown, new ReportBuilder());
  const { doc, format } = target;
  const styles = new StyleAdopter(TextDocumentState.styles(doc, format), format);
  const lists = new Map(Object.keys(read.lists).map((id) => [id, target.newId()]));
  const width = PageSetup.room(TextDocumentState.section(doc, format).setup).across;
  const blocks = mapParagraphs(read.body, (p) => ({
    ...p,
    style: styles.adopt(read.styles, p.style),
    ...(p.list ? { list: { ...p.list, id: lists.get(p.list.id)! } } : {}),
  })).map((block) => {
    if (block.type !== 'table') return block;
    const total = block.columns.reduce((a, b) => a + b, 0);
    return { ...block, columns: block.columns.map((c) => (c / total) * width) };
  });
  setLiveStyles(doc, format, styles.added, target.origin);
  for (const [from, id] of lists) setLiveList(doc, id, read.lists[from]!, target.origin);
  return blocks;
}
