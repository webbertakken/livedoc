// A body read as a comparison reads it (review.md "Compare documents", "What is compared"): words, spaces, punctuation
// marks and objects in a line as tokens, each paragraph opened by its start, each other block one token. A comment's
// edges ride on the token after them, so the selected document's threads land on their own text.
import type { Block, Inline, Paragraph, Run } from '../model/blocks';
import type { CommentMark } from '../model/comments';

/** A run's text cut into words, spaces and single marks; a word keeps its apostrophes. */
const WORDS = /\p{L}[\p{L}\p{N}'’]*|\p{N}+|\s+|[^\s\p{L}\p{N}]/gu;

/** (default) How alike two paragraphs' words are to be paired as one paragraph changed. Safe range: 0.3-0.8. */
export const COMPARE_SIMILAR_PARAGRAPHS = 0.5;

type Carries = { readonly comments: readonly CommentMark[] };
export type StartToken = Carries & { readonly kind: 'start'; readonly paragraph: Paragraph };
export type TextToken = Carries & {
  readonly kind: 'text';
  readonly text: string;
  readonly run: Run;
};
export type ObjectToken = Carries & {
  readonly kind: 'object';
  readonly inline: Inline;
  readonly key: string;
};
export type BlockToken = Carries & {
  readonly kind: 'block';
  readonly block: Block;
  readonly key: string;
};
export type CompareToken = StartToken | TextToken | ObjectToken | BlockToken;

/** A container's blocks as tokens, one list per block, and the comment edges after its last token. */
export type ContainerTokens = {
  readonly blocks: readonly (readonly CompareToken[])[];
  readonly trailing: readonly CommentMark[];
};

/** A value as text with its keys in order and its suggestions left out, so equal content reads equal. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (key, v: unknown) => {
    if (key === 'suggested') return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v))
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)),
      );
    return v;
  });
}

/** The tokens of each block of a container, edges carried to the token after them. */
export function tokensOf(blocks: readonly Block[]): ContainerTokens {
  let pending: CommentMark[] = [];
  const take = (): readonly CommentMark[] => {
    const carried = pending;
    pending = [];
    return carried;
  };
  const lists = blocks.map((block): CompareToken[] => {
    if (block.type !== 'paragraph')
      return [{ kind: 'block', block, key: stableKey(block), comments: take() }];
    const tokens: CompareToken[] = [{ kind: 'start', paragraph: block, comments: take() }];
    for (const inline of block.inlines) {
      if (inline.type === 'comment') pending.push(inline);
      else if (inline.type === 'run')
        for (const text of inline.text.match(WORDS) ?? [])
          tokens.push({ kind: 'text', text, run: inline, comments: take() });
      else tokens.push({ kind: 'object', inline, key: stableKey(inline), comments: take() });
    }
    return tokens;
  });
  return { blocks: lists, trailing: pending };
}

/** How many tokens the blocks hold, notes and cells included. */
export function tokenCount(blocks: readonly Block[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === 'table') {
      for (const row of block.rows) for (const cell of row.cells) count += tokenCount(cell.blocks);
      continue;
    }
    count += 1;
    if (block.type !== 'paragraph') continue;
    for (const inline of block.inlines)
      if (inline.type === 'run') count += inline.text.match(WORDS)?.length ?? 0;
      else if (inline.type === 'note') count += tokenCount(inline.blocks);
      else count += 1;
  }
  return count;
}

/** Whether two tokens read the same: any two starts; words alike in text and link; objects and blocks the same. */
export function sameToken(a: CompareToken, b: CompareToken): boolean {
  if (a.kind === 'start' || b.kind === 'start') return a.kind === b.kind;
  if (a.kind === 'text' && b.kind === 'text') return a.text === b.text && a.run.link === b.run.link;
  if (a.kind === 'text' || b.kind === 'text') return false;
  return a.kind === b.kind && a.key === b.key;
}

/** What a paragraph's tokens read as, start left out: equal for two paragraphs that read the same. */
export const readingKey = (tokens: readonly CompareToken[]): string =>
  tokens
    .slice(1)
    .map((t) =>
      t.kind === 'text' ? `${t.text}\u0001${t.run.link ?? ''}` : t.kind === 'start' ? '' : t.key,
    )
    .join('\u0002');

/** The words of a paragraph's tokens, lowercased, as a set. */
export const wordsOf = (tokens: readonly CompareToken[]): ReadonlySet<string> =>
  new Set(
    tokens.flatMap((t) =>
      t.kind === 'text' && /[\p{L}\p{N}]/u.test(t.text) ? [t.text.toLowerCase()] : [],
    ),
  );

/** How alike two sets of words are: those in both over those in either; two empty sets are alike. */
export function likeness(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let both = 0;
  for (const word of a) if (b.has(word)) both++;
  return both / (a.size + b.size - both);
}
