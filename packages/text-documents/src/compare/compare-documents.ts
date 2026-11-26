// Compare documents (docs/specs/034-text-documents/review.md "Compare documents"): a new text document holding the
// primary with every difference from the selected as a suggestion attributed to a name, so rejecting every one reads
// as the primary and accepting every one as the selected. Pure: each side comes with its own suggestions settled
// (read rejected), as the dialog reads them.
import type { Block, Inline } from '../model/blocks';
import type { FileThread } from '../model/comments';
import { DocumentTabs, type DocumentTab } from '../model/document-tabs';
import type { FileSuggestionAuthor, FileSuggestionMark } from '../model/suggestions';
import type { TextDocument } from '../model/text-document';
import { TEXT_DOCUMENT_SUGGESTIONS_MAX } from '../live/live-suggestion-marks';
import type { CompareContext } from './compare-build';
import { compareBlocks, compareTables } from './compare-body';
import { tokenCount } from './compare-tokens';

/** The most words, spaces and marks one side may hold, about 300 pages (review.md "Bounded", (default)). 1k-1M. */
export const TEXT_DOCUMENT_COMPARE_TOKENS_MAX = 300_000;
/** How long comparing two of the longest documents may take (review.md "Bounded", (default)). 500-10,000 ms. */
export const TEXT_DOCUMENT_COMPARE_BUDGET_MS = 2_000;

/** Why a comparison was not made: a side too long, or more differences than a document holds suggestions. */
export type ComparisonRefusal = 'too-long' | 'too-many';

export type ComparisonResult =
  | {
      readonly ok: true;
      readonly document: TextDocument;
      /** How many suggestions it holds. */
      readonly suggestions: number;
      /** Blocks only the selected has that the model cannot mark, left out. */
      readonly leftOut: number;
    }
  | { readonly ok: false; readonly refusal: ComparisonRefusal };

export type ComparisonOptions = {
  /** Who the differences are attributed to. */
  readonly name: string;
  /** When the comparison is made (ms). */
  readonly at: number;
  /** Whether the selected document's comment threads come with it. */
  readonly comments: boolean;
};

/** The blocks without comment edges, notes' and cells' included. */
function withoutComments(blocks: readonly Block[]): Block[] {
  const inlines = (list: readonly Inline[]): Inline[] =>
    list.flatMap((i): Inline[] =>
      i.type === 'comment'
        ? []
        : i.type === 'note'
          ? [{ ...i, blocks: withoutComments(i.blocks) }]
          : [i],
    );
  return blocks.map((block): Block => {
    if (block.type === 'paragraph') return { ...block, inlines: inlines(block.inlines) };
    if (block.type === 'table')
      return {
        ...block,
        rows: block.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell) => ({ ...cell, blocks: withoutComments(cell.blocks) })),
        })),
      };
    return block;
  });
}

/** The selected's threads, none any person's own here: their authors' keys left out. */
const keylessThreads = (threads: readonly FileThread[]): FileThread[] =>
  threads.map((thread) => ({
    ...thread,
    comments: thread.comments.map((c) => {
      const { key: _, colour: __, ...author } = c.author;
      return { ...c, author };
    }),
  }));

/** A tab id the primary's tabs do not hold. */
function freshId(taken: Set<string>, place: number): string {
  let n = place;
  while (taken.has(`t.${n}`)) n++;
  const id = `t.${n}`;
  taken.add(id);
  return id;
}

/** A record with the entries of `more` the base lacks. */
const withMissing = <T>(base: Readonly<Record<string, T>>, more: Readonly<Record<string, T>>) => ({
  ...more,
  ...base,
});

function compare(
  primary: TextDocument,
  selected: TextDocument,
  options: ComparisonOptions,
): ComparisonResult {
  const pTabs = DocumentTabs.all(primary);
  const sTabs = DocumentTabs.all(selected);
  const tokens = (tabs: readonly DocumentTab[]) => tabs.reduce((n, t) => n + tokenCount(t.body), 0);
  if (
    tokens(pTabs) > TEXT_DOCUMENT_COMPARE_TOKENS_MAX ||
    tokens(sTabs) > TEXT_DOCUMENT_COMPARE_TOKENS_MAX
  )
    return { ok: false, refusal: 'too-long' };

  const author: FileSuggestionAuthor = { name: options.name, comparison: true };
  let suggestions = 0;
  let leftOut = 0;
  const ctx: CompareContext = {
    mark: (): FileSuggestionMark => ({ id: `cmp-${++suggestions}`, at: options.at, author }),
    tables: (p, s) => compareTables(p, s, ctx),
    leaveOut: () => {
      leftOut++;
    },
  };
  const bodyOf = (tab: DocumentTab | undefined, keepComments: boolean): Block[] =>
    tab ? (keepComments ? [...tab.body] : withoutComments(tab.body)) : [];
  const taken = new Set(pTabs.map((t) => t.id));
  const tabs: DocumentTab[] = [];
  for (let k = 0; k < Math.max(pTabs.length, sTabs.length); k++) {
    const p = pTabs[k];
    const s = sTabs[k];
    const body = compareBlocks(bodyOf(p, false), bodyOf(s, options.comments), ctx);
    tabs.push(p ? { ...p, body } : { ...s!, id: freshId(taken, k), body });
  }
  if (suggestions > TEXT_DOCUMENT_SUGGESTIONS_MAX) return { ok: false, refusal: 'too-many' };

  const styles = [
    ...primary.styles,
    ...selected.styles.filter((s) => !primary.styles.some((p) => p.id === s.id)),
  ];
  const { comments: _, ...rest } = primary;
  const threads =
    options.comments && selected.comments?.length ? keylessThreads(selected.comments) : null;
  const document = DocumentTabs.withAll(
    {
      ...rest,
      styles,
      lists: withMissing(primary.lists, selected.lists),
      ...(primary.media || selected.media
        ? { media: withMissing(primary.media ?? {}, selected.media ?? {}) }
        : {}),
      ...(threads ? { comments: threads } : {}),
    },
    tabs,
  );
  return { ok: true, document, suggestions, leftOut };
}

export const TextDocumentComparison = { compare } as const;
